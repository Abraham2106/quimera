import type { Sql } from "postgres";

import { enqueueIntent } from "@quimera/fiscal-outbox";

import { applyWorkOrderTransition, loadWorkOrderForTenant } from "./work-order-store.js";

const DEFAULT_ISSUER_ID = "3101111111";

export type CloseWorkOrderResult = {
  readonly workOrderId: string;
  readonly status: "CLOSED";
  readonly version: number;
  readonly fiscalIntentId: string;
  readonly enqueued: boolean;
};

export async function closeWorkOrderWithFiscalIntent(
  sql: Sql,
  tenantId: string,
  workOrderId: string,
  actorId: string,
  expectedVersion?: number,
): Promise<
  | { ok: true; result: CloseWorkOrderResult }
  | { ok: false; kind: "not_found" | "fsm"; response?: ReturnType<typeof import("../errors.js").fsmFailureToResponse> }
> {
  const row = await loadWorkOrderForTenant(sql, tenantId, workOrderId);
  if (!row) {
    return { ok: false, kind: "not_found" };
  }

  const version = Number(row.version);

  if (row.status === "CLOSED") {
    let fiscalIntentId = row.fiscal_intent_id;
    let enqueued = false;
    if (!fiscalIntentId) {
      const intent = await enqueueIntent(sql, {
        tenantId,
        issuerId: DEFAULT_ISSUER_ID,
        environment: "mock",
        operationId: workOrderId,
        docType: "01",
        payloadSnapshot: {
          workOrderId,
          source: "oficios-close",
        },
      });
      fiscalIntentId = intent.id;
      enqueued = true;
      await sql`
        UPDATE ofi_work_orders
        SET fiscal_intent_id = ${fiscalIntentId}::uuid
        WHERE id = ${workOrderId}::uuid AND tenant_id = ${tenantId}::uuid
      `;
    }
    return {
      ok: true,
      result: {
        workOrderId,
        status: "CLOSED",
        version,
        fiscalIntentId: fiscalIntentId!,
        enqueued,
      },
    };
  }

  const transition = await applyWorkOrderTransition(sql, {
    tenantId,
    workOrderId,
    targetStatus: "CLOSED",
    expectedVersion: expectedVersion ?? version,
    actorId,
  });

  if (!transition.ok) {
    return { ok: false, kind: "fsm", response: transition.response };
  }

  const intent = await enqueueIntent(sql, {
    tenantId,
    issuerId: DEFAULT_ISSUER_ID,
    environment: "mock",
    operationId: workOrderId,
    docType: "01",
    payloadSnapshot: {
      workOrderId,
      source: "oficios-close",
    },
  });

  await sql`
    UPDATE ofi_work_orders
    SET fiscal_intent_id = ${intent.id}::uuid
    WHERE id = ${workOrderId}::uuid AND tenant_id = ${tenantId}::uuid
  `;

  return {
    ok: true,
    result: {
      workOrderId,
      status: "CLOSED",
      version: Number(transition.workOrder.version),
      fiscalIntentId: intent.id,
      enqueued: true,
    },
  };
}