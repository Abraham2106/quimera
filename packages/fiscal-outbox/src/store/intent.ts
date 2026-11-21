import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import type {
  EnqueueFiscalIntentInput,
  FiscalIntentRecord,
  FiscalIntentStatus,
} from "./types.js";

type IntentRow = {
  id: string;
  tenant_id: string;
  issuer_id: string;
  environment: string;
  operation_id: string;
  purpose: string;
  doc_type: string;
  status: string;
  payload_snapshot: unknown;
  created_at: Date;
};

function mapIntentRow(row: IntentRow): FiscalIntentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    issuerId: row.issuer_id,
    environment: row.environment as FiscalIntentRecord["environment"],
    operationId: row.operation_id,
    purpose: row.purpose,
    docType: row.doc_type,
    status: row.status as FiscalIntentStatus,
    payloadSnapshot: row.payload_snapshot,
    createdAt: row.created_at.toISOString(),
  };
}

/** Idempotente: UNIQUE (tenant_id, environment, operation_id, purpose). */
export async function enqueueIntent(
  client: Sql,
  input: EnqueueFiscalIntentInput,
): Promise<FiscalIntentRecord> {
  const purpose = input.purpose ?? "primary";
  const id = randomUUID();

  const inserted = await client<IntentRow[]>`
    INSERT INTO fob_fiscal_intents (
      id,
      tenant_id,
      issuer_id,
      environment,
      operation_id,
      purpose,
      doc_type,
      status,
      payload_snapshot
    )
    VALUES (
      ${id},
      ${input.tenantId}::uuid,
      ${input.issuerId},
      ${input.environment},
      ${input.operationId},
      ${purpose},
      ${input.docType},
      'QUEUED',
      ${client.json(input.payloadSnapshot as never)}
    )
    ON CONFLICT (tenant_id, environment, operation_id, purpose) DO NOTHING
    RETURNING *
  `;

  if (inserted[0]) {
    return mapIntentRow(inserted[0]);
  }

  const existing = await client<IntentRow[]>`
    SELECT *
    FROM fob_fiscal_intents
    WHERE tenant_id = ${input.tenantId}::uuid
      AND environment = ${input.environment}
      AND operation_id = ${input.operationId}
      AND purpose = ${purpose}
  `;

  const row = existing[0];
  if (!row) {
    throw new Error("enqueueIntent conflict without existing row");
  }
  return mapIntentRow(row);
}