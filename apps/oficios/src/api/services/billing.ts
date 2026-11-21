import { createHash, randomUUID } from "node:crypto";

import type { OficiosSql } from "../../db/connection.js";

const STATUSES = new Set(["trialing", "active", "past_due", "suspended", "canceled"]);

export type BillingDecision =
  | { ok: true }
  | { ok: false; status: 402; code: "ERR_QUOTA_EXCEEDED" | "ERR_SUBSCRIPTION_INACTIVE"; message: string };

export async function applyBillingWebhook(
  sql: OficiosSql,
  raw: Uint8Array,
  event: {
    provider: string;
    externalEventId: string;
    eventType: string;
    tenantId: string;
    status: string;
  },
): Promise<{ duplicate: boolean; status: string }> {
  if (!STATUSES.has(event.status)) {
    throw new Error("ERR_VALIDATION");
  }
  const digest = createHash("sha256").update(raw).digest("hex");
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO saas_billing_events (
      id, tenant_id, provider, external_event_id, event_type, payload_sha256
    )
    VALUES (
      ${randomUUID()}::uuid,
      ${event.tenantId}::uuid,
      ${event.provider},
      ${event.externalEventId},
      ${event.eventType},
      ${digest}
    )
    ON CONFLICT (provider, external_event_id) DO NOTHING
    RETURNING id::text
  `;
  if (!inserted[0]) {
    const current = await sql<{ status: string }[]>`
      SELECT status FROM saas_subscriptions WHERE tenant_id = ${event.tenantId}::uuid
    `;
    return { duplicate: true, status: current[0]?.status ?? event.status };
  }
  await sql`
    UPDATE saas_subscriptions
    SET status = ${event.status}, updated_at = now()
    WHERE tenant_id = ${event.tenantId}::uuid
  `;
  return { duplicate: false, status: event.status };
}

export async function evaluateSeatInvitation(sql: OficiosSql, tenantId: string): Promise<BillingDecision> {
  const rows = await sql<
    { status: string; max_seats: number; seats: string }[]
  >`
    SELECT s.status, p.max_seats, (
      SELECT count(*)::text FROM saas_memberships
      WHERE tenant_id = s.tenant_id AND status = 'active'
    ) AS seats
    FROM saas_subscriptions AS s
    INNER JOIN saas_plans AS p ON p.code = s.plan_code
    WHERE s.tenant_id = ${tenantId}::uuid
  `;
  const row = rows[0];
  if (!row) return { ok: true };
  if (row.status === "suspended" || row.status === "canceled") {
    return {
      ok: false,
      status: 402,
      code: "ERR_SUBSCRIPTION_INACTIVE",
      message: "La suscripción no permite nuevas operaciones facturables.",
    };
  }
  if (Number(row.seats) >= row.max_seats) {
    return {
      ok: false,
      status: 402,
      code: "ERR_QUOTA_EXCEEDED",
      message: "El plan alcanzó el máximo de asientos.",
    };
  }
  return { ok: true };
}

export async function loadBillingUsage(sql: OficiosSql, tenantId: string) {
  const rows = await sql<
    {
      status: string;
      plan_code: string;
      max_seats: number;
      monthly_fiscal_intents: number;
      max_storage_bytes: string;
      seats: string;
    }[]
  >`
    SELECT s.status, s.plan_code, p.max_seats, p.monthly_fiscal_intents, p.max_storage_bytes::text,
      (
        SELECT count(*)::text FROM saas_memberships
        WHERE tenant_id = s.tenant_id AND status = 'active'
      ) AS seats
    FROM saas_subscriptions AS s
    INNER JOIN saas_plans AS p ON p.code = s.plan_code
    WHERE s.tenant_id = ${tenantId}::uuid
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    status: row.status,
    planCode: row.plan_code,
    limits: {
      maxSeats: row.max_seats,
      monthlyFiscalIntents: row.monthly_fiscal_intents,
      maxStorageBytes: Number(row.max_storage_bytes),
    },
    usage: { seats: Number(row.seats) },
  };
}
