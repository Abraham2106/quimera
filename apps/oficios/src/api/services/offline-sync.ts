import { randomUUID } from "node:crypto";

import type { OficiosSql } from "../../db/connection.js";
import { saveDiagnosis, saveMaterial, taxRateToBps } from "./workshop.js";

export class SyncConflict extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SyncConflict";
  }
}

type SyncBody = {
  clientMutationId?: string;
  expectedVersion?: number;
  kind?: string;
  notes?: string;
  measurements?: Record<string, unknown>;
  cabysCode?: string;
  quantity?: string;
  unitPriceMinor?: number;
  taxRate?: string;
};

export async function applyOfflineMutation(
  client: OficiosSql,
  tenantId: string,
  workOrderId: string,
  body: SyncBody,
): Promise<Record<string, unknown>> {
  if (!body.clientMutationId || !/^[0-9a-f-]{36}$/i.test(body.clientMutationId)) {
    throw new SyncConflict(400, "ERR_VALIDATION", "client_mutation_id es obligatorio.");
  }
  if (typeof body.expectedVersion !== "number") {
    throw new SyncConflict(400, "ERR_VALIDATION", "expectedVersion es obligatorio.");
  }
  const mutationId = body.clientMutationId;

  const existing = await (async (tx) =>
    tx<{ response_json: Record<string, unknown> }[]>`
      SELECT response_json
      FROM ofi_client_mutations
      WHERE client_mutation_id = ${mutationId}::uuid
    `
  )(client);
  if (existing[0]) {
    return existing[0].response_json;
  }

  const orders = await (async (tx) =>
    tx<{ version: string; fiscal_intent_id: string | null }[]>`
      SELECT version::text, fiscal_intent_id::text
      FROM ofi_work_orders
      WHERE id = ${workOrderId}::uuid
    `
  )(client);
  const order = orders[0];
  if (!order) {
    throw new SyncConflict(400, "ERR_NOT_FOUND", "Orden de trabajo no encontrada.");
  }
  const actualVersion = Number(order.version);
  if (actualVersion !== body.expectedVersion) {
    throw new SyncConflict(409, "ERR_WORK_ORDER_VERSION_MISMATCH", "La orden cambió en el servidor.", {
      actualVersion,
      expectedVersion: body.expectedVersion,
      fiscalIntentId: order.fiscal_intent_id,
    });
  }

  let payload: Record<string, unknown>;
  if (body.kind === "diagnosis") {
    if (!body.notes || body.notes.trim().length === 0) {
      throw new SyncConflict(400, "ERR_VALIDATION", "notes es obligatorio.");
    }
    const diagnosis = await saveDiagnosis(client, tenantId, workOrderId, {
      notes: body.notes.trim(),
      measurements: body.measurements ?? {},
      attachments: [],
    });
    payload = { kind: "diagnosis", diagnosisId: diagnosis.id };
  } else if (body.kind === "material") {
    const taxRateBps = body.taxRate ? taxRateToBps(body.taxRate) : null;
    if (!body.cabysCode || !body.quantity || typeof body.unitPriceMinor !== "number" || taxRateBps === null) {
      throw new SyncConflict(400, "ERR_VALIDATION", "Material incompleto.");
    }
    const material = await saveMaterial(client, tenantId, workOrderId, {
      cabysCode: body.cabysCode,
      quantity: body.quantity,
      unitPriceMinor: body.unitPriceMinor,
      taxRateBps,
    });
    payload = { kind: "material", materialId: material.id };
  } else {
    throw new SyncConflict(400, "ERR_VALIDATION", "kind debe ser diagnosis o material.");
  }

  const nextVersion = actualVersion + 1;
  const updated = await (async (tx) => {
    const rows = await tx<{ id: string }[]>`
      UPDATE ofi_work_orders
      SET version = ${nextVersion}
      WHERE id = ${workOrderId}::uuid AND version = ${actualVersion}
      RETURNING id::text
    `;
    if (!rows[0]) {
      throw new SyncConflict(409, "ERR_WORK_ORDER_VERSION_MISMATCH", "La orden cambió en el servidor.");
    }
    const response = { ok: true, version: nextVersion, ...payload, clientMutationId: mutationId };
    await tx`
      INSERT INTO ofi_client_mutations (tenant_id, client_mutation_id, work_order_id, response_json)
      VALUES (
        ${tenantId}::uuid,
        ${mutationId}::uuid,
        ${workOrderId}::uuid,
        ${tx.json(response)}
      )
    `;
    return response;
  })(client);
  return updated;
}

export function newClientMutationId(): string {
  return randomUUID();
}
