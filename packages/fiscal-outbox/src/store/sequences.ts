import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../db/connection.js";
import { FiscalOutboxDbError } from "../db/errors.js";
import type { AllocateConsecutiveScope } from "./types.js";

const MAX_SEQUENCE = 9_999_999_999;

/** Reserva atómica: INSERT … ON CONFLICT DO UPDATE last_number + 1 (T-OUT-003). */
export async function allocateConsecutive(
  client: Sql,
  scope: AllocateConsecutiveScope,
): Promise<number> {
  const id = randomUUID();

  const rows = await withFobTenantTransaction(client, scope.tenantId, async (tx) =>
    tx<{ last_number: string }[]>`
      INSERT INTO fob_fiscal_sequences (
        id,
        tenant_id,
        issuer_id,
        environment,
        branch,
        terminal,
        doc_type,
        last_number
      )
      VALUES (
        ${id}::uuid,
        ${scope.tenantId}::uuid,
        ${scope.issuerId},
        ${scope.environment},
        ${scope.branch},
        ${scope.terminal},
        ${scope.docType},
        1
      )
      ON CONFLICT (tenant_id, issuer_id, environment, branch, terminal, doc_type)
      DO UPDATE SET
        last_number = fob_fiscal_sequences.last_number + 1,
        updated_at = now()
      RETURNING last_number
    `,
  );

  const value = Number(rows[0]?.last_number);
  if (!Number.isFinite(value) || value < 1) {
    throw new FiscalOutboxDbError(
      "ERR_FISCAL_SEQUENCE",
      "allocateConsecutive returned invalid last_number",
    );
  }
  if (value > MAX_SEQUENCE) {
    throw new FiscalOutboxDbError(
      "ERR_FISCAL_SEQUENCE_OVERFLOW",
      `Sequence overflow for ${scope.issuerId}/${scope.docType}`,
    );
  }
  return value;
}