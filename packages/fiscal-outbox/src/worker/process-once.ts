import { createHash, randomUUID } from "node:crypto";

import {
  classifySendResult,
  evaluateDeadline,
  isValidTransition,
  type DeliveryState,
  type SendResult,
} from "@dojocoding/hacienda-sdk";
import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../db/connection.js";
import { signedXmlMustExistBeforePost } from "../vault/certificate-policy.js";
import { PgDocumentStore } from "../store/pg-document-store.js";
import { rowToStoredDocument } from "../store/row-map.js";
import { claimNextDocument, isPostDispatched, releaseDocumentLease } from "./claim.js";
import { assertFencedUpdate } from "./fencing.js";
import {
  markPostDispatchedAtomically,
  markPostDispatchedExtras,
  patchFiscalDocumentAttempts,
  transitionFiscalDocument,
} from "./persist-delivery.js";
import type {
  ClaimedFiscalDocument,
  FobDeliveryState,
  ProcessOnceOptions,
  ProcessOnceResult,
  TransportCallResult,
} from "./types.js";

const GET_BACKOFF_MS = 5_000;

function scopedStore(
  client: Sql,
  claim: ClaimedFiscalDocument,
  workerId: string,
): PgDocumentStore {
  return new PgDocumentStore(client, {
    tenantId: claim.tenant_id,
    issuerId: claim.issuer_id,
    environment: claim.environment,
    leaseOwner: workerId,
  });
}

function toHaciendaPayload(
  response: TransportCallResult["response"],
): { estado?: string; detalle?: string } | null {
  if (response === undefined) {
    return null;
  }
  return response;
}

/** Relee bajo FOR UPDATE y comprueba el fencing token antes de cualquier reconciliación. */
async function reloadClaimForUpdate(
  client: Sql,
  claim: ClaimedFiscalDocument,
  workerId: string,
): Promise<ClaimedFiscalDocument> {
  const rows = await withFobTenantTransaction(client, claim.tenant_id, async (tx) =>
    tx<ClaimedFiscalDocument[]>`
      SELECT
        d.id, d.tenant_id, d.intent_id, d.clave, d.consecutivo, d.delivery_state,
        d.attempts, d.last_error_json, d.updated_at, d.lease_owner, d.lease_expires_at,
        d.next_poll_at, d.signed_xml_artifact_id,
        i.issuer_id, i.environment
      FROM fob_fiscal_documents AS d
      INNER JOIN fob_fiscal_intents AS i ON i.id = d.intent_id
      WHERE d.id = ${claim.id}::uuid
        AND d.lease_owner = ${workerId}
      FOR UPDATE OF d
    `,
  );
  const latest = rows[0];
  if (!latest) {
    throw new Error("ERR_FOB_FENCE: el lease ya no pertenece a este worker");
  }
  return latest;
}

async function applySendResult(
  client: Sql,
  claim: ClaimedFiscalDocument,
  currentState: FobDeliveryState,
  sendResult: SendResult,
  workerId: string,
  extras?: Record<string, unknown>,
): Promise<FobDeliveryState> {
  if (sendResult.type === "ambiguous") {
    await transitionFiscalDocument(
      client,
      claim,
      "INCIERTO",
      sendResult.error.message,
      { ...markPostDispatchedExtras(), ...extras },
      workerId,
    );
    return "INCIERTO";
  }

  const target = sendResult.state;
  if (target === currentState) {
    return currentState;
  }

  const reason =
    sendResult.type === "rejected"
      ? sendResult.reason
      : sendResult.type === "link_down"
        ? sendResult.error.message
        : undefined;

  if (currentState === "INCIERTO") {
    await transitionFiscalDocument(client, claim, target, reason, extras, workerId);
    return target;
  }

  const store = scopedStore(client, claim, workerId);
  await store.transition(
    claim.clave,
    currentState as DeliveryState,
    target,
    reason,
  );

  if (extras && Object.keys(extras).length > 0) {
    const refreshed = await withFobTenantTransaction(client, claim.tenant_id, async (tx) =>
      tx<ClaimedFiscalDocument[]>`
        SELECT
          id, tenant_id, intent_id, clave, consecutivo, delivery_state, attempts,
          last_error_json, updated_at, lease_owner, lease_expires_at, next_poll_at,
          signed_xml_artifact_id,
          ${claim.issuer_id} AS issuer_id,
          ${claim.environment} AS environment
        FROM fob_fiscal_documents
        WHERE id = ${claim.id}::uuid
          AND lease_owner = ${workerId}
        FOR UPDATE
      `,
    );
    const latest = refreshed[0];
    if (!latest) {
      throw new Error("ERR_FOB_FENCE: el lease ya no pertenece a este worker");
    }
    await patchFiscalDocumentAttempts(
      client,
      latest,
      latest.attempts,
      null,
      extras,
      workerId,
    );
  }

  return target;
}

async function reconcileByClave(
  client: Sql,
  claim: ClaimedFiscalDocument,
  options: ProcessOnceOptions,
): Promise<void> {
  const locked = await reloadClaimForUpdate(client, claim, options.workerId);
  const result = await options.transport.getByClave(locked.clave, options.signal);
  const classified = classifySendResult(
    result.error ?? null,
    result.httpStatus,
    toHaciendaPayload(result.response),
  );
  const state = locked.delivery_state as FobDeliveryState;
  const nextState = await applySendResult(
    client,
    locked,
    state,
    classified,
    options.workerId,
  );
  await persistTerminalResponse(client, locked, nextState, result.responseXml, options.workerId);

  const terminal = nextState === "ACEPTADO" || nextState === "RECHAZADO";
  const nextPollAt = terminal
    ? null
    : new Date((options.now?.() ?? new Date()).getTime() + GET_BACKOFF_MS);

  await patchFiscalDocumentAttempts(
    client,
    { ...locked, delivery_state: nextState as typeof locked.delivery_state },
    locked.attempts + 1,
    nextPollAt,
    isPostDispatched(locked.last_error_json) || state === "INCIERTO"
      ? markPostDispatchedExtras()
      : undefined,
    options.workerId,
  );
}

async function readSignedArtifactId(
  client: Sql,
  claim: ClaimedFiscalDocument,
  workerId: string,
): Promise<string | null> {
  const rows = await withFobTenantTransaction(client, claim.tenant_id, async (tx) =>
    tx<{ signed_xml_artifact_id: string | null }[]>`
      SELECT signed_xml_artifact_id
      FROM fob_fiscal_documents
      WHERE id = ${claim.id}::uuid
        AND lease_owner = ${workerId}
      FOR UPDATE
    `,
  );
  const row = rows[0];
  if (!row) {
    throw new Error("ERR_FOB_FENCE: el lease ya no pertenece a este worker");
  }
  return row.signed_xml_artifact_id ?? claim.signed_xml_artifact_id;
}

async function persistXmlArtifact(
  client: Sql,
  tenantId: string,
  kind: "fe_xml_signed" | "hacienda_response",
  name: string,
  xml: string,
): Promise<string> {
  const artifactId = randomUUID();
  const sha256 = createHash("sha256").update(xml).digest("hex");
  await withFobTenantTransaction(client, tenantId, async (tx) => {
    await tx`
      INSERT INTO qum_artifacts (
        id, tenant_id, sha256, artifact_kind, original_name, mime_type, byte_size, storage_uri
      )
      VALUES (
        ${artifactId}::uuid,
        ${tenantId}::uuid,
        ${sha256},
        ${kind},
        ${name},
        'application/xml',
        ${Buffer.byteLength(xml, "utf8")},
        ${`cas://fiscal-outbox/${sha256}`}
      )
    `;
  });
  return artifactId;
}

async function persistTerminalResponse(
  client: Sql,
  claim: ClaimedFiscalDocument,
  state: FobDeliveryState,
  responseXml: string | undefined,
  workerId: string,
): Promise<void> {
  if (!responseXml || (state !== "ACEPTADO" && state !== "RECHAZADO")) {
    return;
  }
  const artifactId = await persistXmlArtifact(
    client,
    claim.tenant_id,
    "hacienda_response",
    `respuesta-${claim.clave}.xml`,
    responseXml,
  );
  await withFobTenantTransaction(client, claim.tenant_id, async (tx) => {
    const result = await tx`
      UPDATE fob_fiscal_documents
      SET response_artifact_id = ${artifactId}::uuid
      WHERE id = ${claim.id}::uuid
        AND lease_owner = ${workerId}
    `;
    assertFencedUpdate(result, claim.id);
  });
}

async function dispatchPost(
  client: Sql,
  claim: ClaimedFiscalDocument,
  options: ProcessOnceOptions,
): Promise<void> {
  const workerId = options.workerId;
  const doc = rowToStoredDocument(claim);
  const deadline = evaluateDeadline(doc, options.now?.());
  if (deadline.expired && deadline.state === "VENCIDO") {
    const store = scopedStore(client, claim, workerId);
    if (isValidTransition(doc.state, "VENCIDO")) {
      await store.transition(claim.clave, doc.state, "VENCIDO", "deadline expired");
    }
    return;
  }

  const store = scopedStore(client, claim, workerId);

  if (doc.state === "FIRMADO") {
    await store.transition(claim.clave, "FIRMADO", "PENDIENTE", "worker: pre-POST");
  }

  let signedArtifactId = await readSignedArtifactId(client, claim, workerId);
  if (!signedArtifactId && options.signXml) {
    const signedXml = await options.signXml(doc.xml);
    signedArtifactId = await persistXmlArtifact(
      client,
      claim.tenant_id,
      "fe_xml_signed",
      `signed-${claim.clave}.xml`,
      signedXml,
    );
    await withFobTenantTransaction(client, claim.tenant_id, async (tx) => {
      const result = await tx`
        UPDATE fob_fiscal_documents
        SET signed_xml_artifact_id = ${signedArtifactId}::uuid
        WHERE id = ${claim.id}::uuid
          AND lease_owner = ${workerId}
      `;
      assertFencedUpdate(result, claim.id);
    });
  }
  signedXmlMustExistBeforePost(signedArtifactId);

  // Latch atómico ANTES del POST: si el proceso muere, el próximo ciclo sólo hace GET.
  await markPostDispatchedAtomically(client, claim.tenant_id, claim.id, workerId);

  const result = await options.transport.postDocument({
    clave: claim.clave,
    xml: doc.xml,
    signal: options.signal,
  });
  const classified = classifySendResult(
    result.error ?? null,
    result.httpStatus,
    toHaciendaPayload(result.response),
  );

  const refreshed = await reloadClaimForUpdate(client, claim, workerId);
  const current = refreshed;
  const fromState = current.delivery_state as FobDeliveryState;

  const nextState = await applySendResult(
    client,
    current,
    fromState,
    classified,
    workerId,
    classified.type === "ambiguous" ? markPostDispatchedExtras() : undefined,
  );
  await persistTerminalResponse(client, current, nextState, result.responseXml, workerId);

  const clock = options.now?.() ?? new Date();
  const nextPollAt =
    classified.type === "ambiguous"
      ? new Date(clock.getTime() - 1_000)
      : new Date(clock.getTime() + GET_BACKOFF_MS);
  await patchFiscalDocumentAttempts(
    client,
    current,
    current.attempts + 1,
    nextPollAt,
    classified.type === "ambiguous" ? markPostDispatchedExtras() : undefined,
    workerId,
  );
}

function shouldReconcileOnly(
  state: FobDeliveryState,
  lastErrorJson: Record<string, unknown> | null,
): boolean {
  return (
    state === "INCIERTO" ||
    state === "ENVIADO" ||
    (state === "PENDIENTE" && isPostDispatched(lastErrorJson))
  );
}

export async function processOnce(
  client: Sql,
  options: ProcessOnceOptions,
): Promise<ProcessOnceResult> {
  const claim = await claimNextDocument(client, options);
  if (!claim) {
    return { processed: false };
  }

  try {
    const state = claim.delivery_state as FobDeliveryState;

    if (shouldReconcileOnly(state, claim.last_error_json)) {
      await reconcileByClave(client, claim, options);
      return { processed: true, documentId: claim.id, clave: claim.clave, action: "get" };
    }

    if (state === "FIRMADO" || state === "PENDIENTE") {
      await dispatchPost(client, claim, options);
      return { processed: true, documentId: claim.id, clave: claim.clave, action: "post" };
    }

    await reconcileByClave(client, claim, options);
    return { processed: true, documentId: claim.id, clave: claim.clave, action: "get" };
  } finally {
    await releaseDocumentLease(client, options.tenantId, claim.id, options.workerId);
  }
}
