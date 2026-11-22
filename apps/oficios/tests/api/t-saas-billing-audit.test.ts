import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { resetWebhookReplayStoreForTests } from "../../src/api/billing/webhook-replay.js";
import { redactAuditText } from "../../src/api/services/audit-log.js";
import { withOfiTenantTransaction } from "../../src/db/connection.js";
import { TENANT_ID, apiTestHeaders, seedCustomerEquipment, setupApiDb } from "./helpers.js";
import { signedBillingWebhookHeaders } from "./test-webhook.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("billing, auditoría y sondas", () => {
  let client: Sql;
  let dbAvailable = false;
  let customerId = "";
  let equipmentId = "";

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
    if (!dbAvailable) return;
    const seeded = await seedCustomerEquipment(client);
    customerId = seeded.customerId;
    equipmentId = seeded.equipmentId;
    await withOfiTenantTransaction(client, TENANT_ID, async (tx) => {
      await tx`
        UPDATE saas_plans SET max_seats = 1 WHERE code = 'starter'
      `;
      await tx`
        INSERT INTO saas_subscriptions (tenant_id, plan_code, status, current_period_end)
        VALUES (${TENANT_ID}::uuid, 'starter', 'trialing', now() + interval '30 days')
      `;
      await tx`
        INSERT INTO saas_memberships (id, tenant_id, user_sub, role, status)
        VALUES (gen_random_uuid(), ${TENANT_ID}::uuid, 'seat-1', 'ADMIN', 'active')
      `;
    });
  });

  afterAll(async () => {
    if (client) await client.end({ timeout: 2 });
  });

  it("T-SEC-002 rechaza HMAC inválido y deduplica external_event_id", async () => {
    if (!dbAvailable) return;
    resetWebhookReplayStoreForTests();
    const app = createApp({ sql: client });
    const payload = Buffer.from(
      JSON.stringify({
        provider: "deterministic",
        external_event_id: "evt-1",
        type: "subscription.updated",
        tenant_id: TENANT_ID,
        status: "active",
      }),
    );
    const now = Math.floor(Date.now() / 1000);
    const staleTs = now - 3600;
    const bad = await app.request("/api/v1/billing/webhooks", {
      method: "POST",
      headers: {
        ...signedBillingWebhookHeaders(payload, "quimera-test-webhook-secret", now),
        "x-quimera-signature": "ab".repeat(32),
      },
      body: payload,
    });
    expect(bad.status).toBe(401);
    const stale = await app.request("/api/v1/billing/webhooks", {
      method: "POST",
      headers: signedBillingWebhookHeaders(payload, "quimera-test-webhook-secret", staleTs),
      body: payload,
    });
    expect(stale.status).toBe(401);
    const unchanged = await withOfiTenantTransaction(client, TENANT_ID, async (tx) =>
      tx<{ status: string }[]>`SELECT status FROM saas_subscriptions`,
    );
    expect(unchanged[0]?.status).toBe("trialing");

    const firstHeaders = signedBillingWebhookHeaders(payload, "quimera-test-webhook-secret", now);
    const ok = await app.request("/api/v1/billing/webhooks", {
      method: "POST",
      headers: firstHeaders,
      body: payload,
    });
    expect(ok.status).toBe(200);

    const replay = await app.request("/api/v1/billing/webhooks", {
      method: "POST",
      headers: firstHeaders,
      body: payload,
    });
    expect(replay.status).toBe(401);

    const again = await app.request("/api/v1/billing/webhooks", {
      method: "POST",
      headers: signedBillingWebhookHeaders(payload, "quimera-test-webhook-secret", now + 1),
      body: payload,
    });
    const againJson = (await again.json()) as { duplicate: boolean; status: string };
    expect(again.status).toBe(200);
    expect(againJson.duplicate).toBe(true);
    expect(againJson.status).toBe("active");
    const events = await withOfiTenantTransaction(client, TENANT_ID, async (tx) =>
      tx<{ count: string }[]>`SELECT count(*)::text AS count FROM saas_billing_events`,
    );
    expect(events[0]?.count).toBe("1");
    expect(redactAuditText("HACIENDA_P12_PIN=4321 postgres://quimera:secret@db/quimera")).not.toContain("4321");
    expect(redactAuditText("HACIENDA_P12_PIN=4321 postgres://quimera:secret@db/quimera")).not.toContain("secret@");
  });

  it("responde 402 al exceder asientos y no corta un FiscalIntent ya encolado", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const invited = await app.request("/api/v1/invitations", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify({ email: "nuevo@example.com", role: "OPERATOR" }),
    });
    expect(invited.status).toBe(402);
    const invitedJson = (await invited.json()) as { error: { code: string } };
    expect(invitedJson.error.code).toBe("ERR_QUOTA_EXCEEDED");

    const suspend = Buffer.from(
      JSON.stringify({
        provider: "deterministic",
        external_event_id: "evt-suspend",
        type: "subscription.updated",
        tenant_id: TENANT_ID,
        status: "suspended",
      }),
    );
    const suspended = await app.request("/api/v1/billing/webhooks", {
      method: "POST",
      headers: signedBillingWebhookHeaders(suspend, "quimera-test-webhook-secret"),
      body: suspend,
    });
    expect(suspended.status).toBe(200);

    const created = await app.request("/api/v1/work-orders", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify({ customerId, equipmentId }),
    });
    expect(created.status).toBe(402);
    const read = await app.request("/api/v1/work-orders", { headers: apiTestHeaders("ADMIN") });
    expect(read.status).toBe(200);
  });

  it("AUDITOR_READONLY ve solo su tenant y la bitácora rechaza UPDATE", async () => {
    if (!dbAvailable) return;
    const other = "33333333-3333-4333-8333-333333333333";
    await client`
      INSERT INTO qum_tenants (id, slug, display_name)
      VALUES (${other}::uuid, 'audit-b', 'Audit B')
      ON CONFLICT (id) DO NOTHING
    `;
    await withOfiTenantTransaction(client, TENANT_ID, async (tx) => {
      await tx`
        INSERT INTO saas_audit_logs (id, tenant_id, actor_id, action, resource)
        VALUES (gen_random_uuid(), ${TENANT_ID}::uuid, 'admin-a', 'invitation.create', 'invitation:a')
      `;
    });
    await withOfiTenantTransaction(client, other, async (tx) => {
      await tx`
        INSERT INTO saas_audit_logs (id, tenant_id, actor_id, action, resource)
        VALUES (gen_random_uuid(), ${other}::uuid, 'admin-b', 'pin=super-secret', 'tenant-b')
      `;
    });
    const app = createApp({ sql: client });
    const listed = await app.request("/api/v1/audit", { headers: apiTestHeaders("AUDITOR_READONLY") });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { events: Array<{ actorId: string; resource: string }> };
    expect(body.events.every((event) => event.actorId !== "admin-b")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("super-secret");
    const denied = await app.request("/api/v1/audit", { headers: apiTestHeaders("OPERATOR") });
    expect(denied.status).toBe(403);
    await expect(
      withOfiTenantTransaction(client, TENANT_ID, async (tx) => {
        await tx`UPDATE saas_audit_logs SET action = 'tamper'`;
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("healthz vive y readyz no filtra DATABASE_URL", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const live = await app.request("/healthz");
    expect(live.status).toBe(200);
    const ready = await app.request("/readyz");
    expect(ready.status).toBe(200);
    const failing = (() => {
      throw new Error("postgres://quimera:supersecret@db/quimera");
    }) as unknown as Sql;
    const down = createApp({ sql: failing });
    const response = await down.request("/readyz");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("supersecret");
  });

  it("T-SEC-011 el CI incluye verify, gitleaks y audit, y las imágenes no son root", async () => {
    const ci = await readFile(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("pnpm spec:validate");
    expect(ci).toContain("pnpm verify");
    expect(ci).toContain("gitleaks");
    expect(ci).toContain("pnpm audit --audit-level=high");
    const apiImage = await readFile(path.join(repoRoot, "deploy/oficios-api.Dockerfile"), "utf8");
    const workerImage = await readFile(path.join(repoRoot, "deploy/fiscal-outbox-worker.Dockerfile"), "utf8");
    expect(apiImage).toContain("USER node");
    expect(workerImage).toContain("USER node");
    expect(apiImage).not.toContain("USER root");
    expect(workerImage).not.toContain("USER root");
  });
});
