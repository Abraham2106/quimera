import {
  isValidTransition,
  type DeliveryState,
  type StoredDocument,
} from "@dojocoding/hacienda-sdk";
import type { Sql, TransactionSql } from "postgres";

import { withFobTenantTransaction } from "../db/connection.js";
import {
  deliveryJsonEnvelope,
  rowToStoredDocument,
  snapshotFromStoredDocument,
  type FiscalDocumentRow,
} from "../store/row-map.js";
import {
  POST_DISPATCHED_JSON_KEY,
  type FobDeliveryState,
} from "./types.js";

function mergeLastErrorJson(
  prior: Record<string, unknown> | null,
  snapshot: StoredDocument,
  extras: Record<string, unknown>,
  lastError?: string,
): Record<string, unknown> {
  const envelope = deliveryJsonEnvelope(
    snapshotFromStoredDocument(snapshot),
    lastError ?? snapshot.lastError,
  );
  return {
    ...(prior ?? {}),
    ...envelope,
    ...extras,
  };
}

type FobWriteClient = Sql | TransactionSql;

export async function transitionFiscalDocument(
  client: FobWriteClient,
  row: FiscalDocumentRow,
  to: FobDeliveryState,
  reason?: string,
  extras?: Record<string, unknown>,
): Promise<StoredDocument> {
  const doc = rowToStoredDocument(row);
  const fromFob = row.delivery_state as FobDeliveryState;
  const fromSdk = doc.state;
  const toSdk = to as DeliveryState;

  const usesSdk = fromFob !== "INCIERTO" && to !== "INCIERTO";

  if (usesSdk && !isValidTransition(fromSdk, toSdk)) {
    throw new Error("Delivery transition conflict");
  }

  const at = new Date().toISOString();
  const transitions = [
    ...doc.transitions,
    {
      from: fromSdk,
      to: toSdk,
      at,
      ...(reason !== undefined ? { reason } : {}),
    },
  ];
  const next: StoredDocument = {
    ...doc,
    state: toSdk,
    transitions: transitions as StoredDocument["transitions"],
    ...(reason !== undefined ? { lastError: reason } : {}),
  };

  const merged = mergeLastErrorJson(
    row.last_error_json,
    next,
    extras ?? {},
    next.lastError,
  );

  await withFobTenantTransaction(client, row.tenant_id, async (tx) => {
    await tx`
      UPDATE fob_fiscal_documents
      SET
        delivery_state = ${to},
        last_error_json = ${tx.json(merged as never)},
        updated_at = now()
      WHERE id = ${row.id}::uuid
    `;
  });

  return next;
}

export async function patchFiscalDocumentAttempts(
  client: FobWriteClient,
  row: FiscalDocumentRow,
  attempts: number,
  nextPollAt: Date | null,
  extras?: Record<string, unknown>,
): Promise<void> {
  const doc = rowToStoredDocument(row);
  const merged = mergeLastErrorJson(
    row.last_error_json,
    { ...doc, attempts },
    extras ?? {},
    doc.lastError,
  );

  await withFobTenantTransaction(client, row.tenant_id, async (tx) => {
    await tx`
      UPDATE fob_fiscal_documents
      SET
        attempts = ${attempts},
        next_poll_at = ${nextPollAt ? nextPollAt.toISOString() : null}::timestamptz,
        last_error_json = ${tx.json(merged as never)},
        updated_at = now()
      WHERE id = ${row.id}::uuid
    `;
  });
}

export function markPostDispatchedExtras(): Record<string, unknown> {
  return { [POST_DISPATCHED_JSON_KEY]: true };
}