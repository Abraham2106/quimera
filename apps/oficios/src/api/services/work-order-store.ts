import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { transitionWorkOrder } from "../../domain/work-order-fsm.js";
import type { WorkOrderStatus } from "../../domain/work-order-status.js";
import { fsmFailureToResponse } from "../errors.js";

export type WorkOrderRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  equipment_id: string;
  trade_contract_id: string;
  status: WorkOrderStatus;
  customer_authorized: boolean;
  version: string;
  fiscal_intent_id: string | null;
};

export async function loadWorkOrderForTenant(
  sql: Sql,
  tenantId: string,
  workOrderId: string,
): Promise<WorkOrderRow | null> {
  const rows = await sql<WorkOrderRow[]>`
    SELECT
      id,
      tenant_id,
      customer_id,
      equipment_id,
      trade_contract_id,
      status,
      customer_authorized,
      version::text,
      fiscal_intent_id::text
    FROM ofi_work_orders
    WHERE id = ${workOrderId}::uuid
      AND tenant_id = ${tenantId}::uuid
  `;
  return rows[0] ?? null;
}

export async function createWorkOrderReceived(
  sql: Sql,
  tenantId: string,
  customerId: string,
  equipmentId: string,
  actorId: string,
): Promise<WorkOrderRow> {
  const customer = await sql<{ id: string }[]>`
    SELECT id FROM ofi_customers
    WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid
  `;
  if (!customer[0]) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }

  const equipment = await sql<{ id: string; trade_contract_id: string }[]>`
    SELECT id, trade_contract_id FROM ofi_equipment
    WHERE id = ${equipmentId}::uuid
      AND tenant_id = ${tenantId}::uuid
      AND customer_id = ${customerId}::uuid
  `;
  if (!equipment[0]) {
    throw new Error("EQUIPMENT_NOT_FOUND");
  }

  const id = randomUUID();
  await sql`
    INSERT INTO ofi_work_orders (
      id,
      tenant_id,
      customer_id,
      equipment_id,
      trade_contract_id,
      status,
      customer_authorized,
      version
    )
    VALUES (
      ${id}::uuid,
      ${tenantId}::uuid,
      ${customerId}::uuid,
      ${equipmentId}::uuid,
      ${equipment[0].trade_contract_id},
      'RECEIVED',
      false,
      1
    )
  `;

  await sql`
    INSERT INTO ofi_work_order_events (
      id,
      tenant_id,
      work_order_id,
      event_type,
      to_status,
      actor_id
    )
    VALUES (
      ${randomUUID()}::uuid,
      ${tenantId}::uuid,
      ${id}::uuid,
      'WORK_ORDER_CREATED',
      'RECEIVED',
      ${actorId}
    )
  `;

  const created = await loadWorkOrderForTenant(sql, tenantId, id);
  if (!created) {
    throw new Error("WORK_ORDER_CREATE_FAILED");
  }
  return created;
}

export type ApplyTransitionInput = {
  readonly tenantId: string;
  readonly workOrderId: string;
  readonly targetStatus: WorkOrderStatus;
  readonly expectedVersion: number;
  readonly actorId: string;
};

export async function applyWorkOrderTransition(
  sql: Sql,
  input: ApplyTransitionInput,
):
  Promise<
    | { ok: true; workOrder: WorkOrderRow }
    | { ok: false; response: ReturnType<typeof fsmFailureToResponse> }
  > {
  const row = await loadWorkOrderForTenant(sql, input.tenantId, input.workOrderId);
  if (!row) {
    throw new Error("WORK_ORDER_NOT_FOUND");
  }

  const actualVersion = Number(row.version);
  const decision = transitionWorkOrder({
    tradeContractId: row.trade_contract_id,
    currentStatus: row.status,
    targetStatus: input.targetStatus,
    customerAuthorized: row.customer_authorized,
    expectedVersion: input.expectedVersion,
    actualVersion,
  });

  if (!decision.ok) {
    return { ok: false, response: fsmFailureToResponse(decision) };
  }

  const fromStatus = row.status;
  await sql`
    UPDATE ofi_work_orders
    SET
      status = ${decision.nextStatus},
      version = ${decision.nextVersion},
      customer_authorized = ${decision.customerAuthorized},
      closed_at = CASE
        WHEN ${decision.nextStatus} = 'CLOSED' THEN now()
        ELSE closed_at
      END
    WHERE id = ${input.workOrderId}::uuid
      AND tenant_id = ${input.tenantId}::uuid
      AND version = ${actualVersion}
  `;

  await sql`
    INSERT INTO ofi_work_order_events (
      id,
      tenant_id,
      work_order_id,
      event_type,
      from_status,
      to_status,
      actor_id
    )
    VALUES (
      ${randomUUID()}::uuid,
      ${input.tenantId}::uuid,
      ${input.workOrderId}::uuid,
      'STATUS_TRANSITION',
      ${fromStatus},
      ${decision.nextStatus},
      ${input.actorId}
    )
  `;

  const updated = await loadWorkOrderForTenant(sql, input.tenantId, input.workOrderId);
  if (!updated) {
    throw new Error("WORK_ORDER_UPDATE_FAILED");
  }
  return { ok: true, workOrder: updated };
}

export async function registerCustomerApproval(
  sql: Sql,
  tenantId: string,
  workOrderId: string,
  actorId: string,
  approverName?: string,
): Promise<
  | { ok: true; workOrder: WorkOrderRow }
  | { ok: false; response: ReturnType<typeof fsmFailureToResponse> }
> {
  const row = await loadWorkOrderForTenant(sql, tenantId, workOrderId);
  if (!row) {
    throw new Error("WORK_ORDER_NOT_FOUND");
  }

  if (row.status === "QUOTED") {
    const transition = await applyWorkOrderTransition(sql, {
      tenantId,
      workOrderId,
      targetStatus: "APPROVED",
      expectedVersion: Number(row.version),
      actorId,
    });
    if (!transition.ok) {
      return transition;
    }
    await sql`
      UPDATE ofi_work_orders
      SET customer_authorized = true
      WHERE id = ${workOrderId}::uuid AND tenant_id = ${tenantId}::uuid
    `;
    await sql`
      INSERT INTO ofi_work_order_events (
        id,
        tenant_id,
        work_order_id,
        event_type,
        actor_id,
        payload_json
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${tenantId}::uuid,
        ${workOrderId}::uuid,
        'CUSTOMER_APPROVAL',
        ${actorId},
        ${sql.json({ approverName: approverName ?? null })}
      )
    `;
    const workOrder = await loadWorkOrderForTenant(sql, tenantId, workOrderId);
    if (!workOrder) {
      throw new Error("WORK_ORDER_NOT_FOUND");
    }
    return { ok: true, workOrder: { ...workOrder, customer_authorized: true } };
  }

  await sql`
    UPDATE ofi_work_orders
    SET customer_authorized = true
    WHERE id = ${workOrderId}::uuid AND tenant_id = ${tenantId}::uuid
  `;
  await sql`
    INSERT INTO ofi_work_order_events (
      id,
      tenant_id,
      work_order_id,
      event_type,
      actor_id,
      payload_json
    )
    VALUES (
      ${randomUUID()}::uuid,
      ${tenantId}::uuid,
      ${workOrderId}::uuid,
      'CUSTOMER_APPROVAL',
      ${actorId},
      ${sql.json({ approverName: approverName ?? null })}
    )
  `;

  const workOrder = await loadWorkOrderForTenant(sql, tenantId, workOrderId);
  if (!workOrder) {
    throw new Error("WORK_ORDER_NOT_FOUND");
  }
  return { ok: true, workOrder: { ...workOrder, customer_authorized: true } };
}

export function serializeWorkOrder(row: WorkOrderRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    equipmentId: row.equipment_id,
    tradeContractId: row.trade_contract_id,
    status: row.status,
    customerAuthorized: row.customer_authorized,
    version: Number(row.version),
    fiscalIntentId: row.fiscal_intent_id,
  };
}