import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../db/connection.js";
import type { ClaimedFiscalDocument, ProcessOnceOptions } from "./types.js";

export function isPostDispatched(
  lastErrorJson: Record<string, unknown> | null,
): boolean {
  return lastErrorJson?.["_postDispatched"] === true;
}

export async function claimNextDocument(
  client: Sql,
  options: Pick<ProcessOnceOptions, "workerId" | "tenantId" | "leaseSeconds" | "now">,
): Promise<ClaimedFiscalDocument | null> {
  const leaseSeconds = options.leaseSeconds ?? 60;
  const now = options.now?.() ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);

  const rows = await withFobTenantTransaction(client, options.tenantId, async (tx) =>
    tx<ClaimedFiscalDocument[]>`
      WITH picked AS (
        SELECT d.id
        FROM fob_fiscal_documents AS d
        WHERE d.tenant_id = ${options.tenantId}::uuid
          AND d.delivery_state IN (
            'FIRMADO',
            'PENDIENTE',
            'ENVIADO',
            'INCIERTO'
          )
          AND (d.next_poll_at IS NULL OR d.next_poll_at <= ${now.toISOString()}::timestamptz)
          AND (
            d.lease_expires_at IS NULL
            OR d.lease_expires_at < ${now.toISOString()}::timestamptz
          )
        ORDER BY d.updated_at ASC
        FOR UPDATE OF d SKIP LOCKED
        LIMIT 1
      )
      UPDATE fob_fiscal_documents AS d
      SET
        lease_owner = ${options.workerId},
        lease_expires_at = ${leaseExpiresAt.toISOString()}::timestamptz,
        next_poll_at = ${leaseExpiresAt.toISOString()}::timestamptz,
        updated_at = now()
      FROM picked
      WHERE d.id = picked.id
      RETURNING
        d.id,
        d.tenant_id,
        d.intent_id,
        d.clave,
        d.consecutivo,
        d.delivery_state,
        d.attempts,
        d.last_error_json,
        d.updated_at,
        d.lease_owner,
        d.lease_expires_at,
        d.next_poll_at,
        d.signed_xml_artifact_id,
        (SELECT i.issuer_id FROM fob_fiscal_intents AS i WHERE i.id = d.intent_id) AS issuer_id,
        (SELECT i.environment FROM fob_fiscal_intents AS i WHERE i.id = d.intent_id) AS environment
    `,
  );

  const row = rows[0];
  if (!row) {
    return null;
  }
  return row;
}

export async function releaseDocumentLease(
  client: Sql,
  tenantId: string,
  documentId: string,
): Promise<void> {
  await withFobTenantTransaction(client, tenantId, async (tx) => {
    await tx`
      UPDATE fob_fiscal_documents
      SET lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ${documentId}::uuid
    `;
  });
}