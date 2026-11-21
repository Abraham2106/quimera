import type { Context } from "hono";
import type { Sql } from "postgres";

import { withOfiTenantTransaction } from "../../db/connection.js";
import { billingWebhookSecret, verifyWebhookHmac } from "../billing/hmac.js";
import { ERR_UNAUTHORIZED, errorResponse } from "../errors.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";
import { applyBillingWebhook, loadBillingUsage } from "../services/billing.js";

type WebhookBody = {
  provider?: string;
  external_event_id?: string;
  type?: string;
  tenant_id?: string;
  status?: string;
};

export async function handleBillingWebhook(
  c: Context<OficiosAppEnv>,
  sql: Sql | undefined,
): Promise<Response> {
  const raw = new Uint8Array(await c.req.arrayBuffer());
  const secret = billingWebhookSecret();
  if (!sql || !secret || !verifyWebhookHmac(raw, c.req.header("x-quimera-signature"), secret)) {
    const { status, body } = errorResponse(401, ERR_UNAUTHORIZED, "SECURITY", "Firma HMAC inválida.");
    return c.json(body, status);
  }
  let parsed: WebhookBody;
  try {
    parsed = JSON.parse(Buffer.from(raw).toString("utf8")) as WebhookBody;
  } catch {
    const { status, body } = errorResponse(401, ERR_UNAUTHORIZED, "SECURITY", "Firma HMAC inválida.");
    return c.json(body, status);
  }
  if (!parsed.provider || !parsed.external_event_id || !parsed.tenant_id || !parsed.status) {
    const { status, body } = errorResponse(401, ERR_UNAUTHORIZED, "SECURITY", "Evento de cobro incompleto.");
    return c.json(body, status);
  }
  try {
    const result = await withOfiTenantTransaction(sql, parsed.tenant_id, (tx) =>
      applyBillingWebhook(tx, raw, {
        provider: parsed.provider!,
        externalEventId: parsed.external_event_id!,
        eventType: parsed.type ?? "subscription.updated",
        tenantId: parsed.tenant_id!,
        status: parsed.status!,
      }),
    );
    return c.json({ ok: true, duplicate: result.duplicate, status: result.status });
  } catch {
    const { status, body } = errorResponse(401, ERR_UNAUTHORIZED, "SECURITY", "No se aplicó el evento de cobro.");
    return c.json(body, status);
  }
}

export function createBillingUsageRoute() {
  return async (c: Context<OficiosAppEnv>) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(403, "ERR_FORBIDDEN", "SECURITY", "Solo un ADMIN consulta el consumo.");
      return c.json(body, status);
    }
    const usage = await loadBillingUsage(c.get("sql"), c.get("tenantId"));
    return c.json({ ok: true, billing: usage });
  };
}
