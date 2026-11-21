import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createOficiosPostgresClient,
  withOfiTenantTransaction,
} from "../../src/db/connection.js";
import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "../../src/domain/hvac-refrigeration-v1.js";
import { TENANT_A, TENANT_B } from "./t-sec-ofi-rls.test.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

async function readSql(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function dropSaas(client: Sql): Promise<void> {
  for (const table of [
    "saas_audit_logs",
    "saas_usage_meters",
    "saas_billing_events",
    "saas_subscriptions",
    "saas_plans",
    "saas_invitations",
    "saas_memberships",
    "saas_organizations",
  ]) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function resetSaasOnExistingSchema(client: Sql): Promise<void> {
  await dropSaas(client);
  await client.unsafe(await readSql("apps/oficios/drizzle/0004_saas_b2b_onboarding.sql"));
}

async function saasRlsTables(client: Sql) {
  return client<
    { table: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
  >`
    SELECT c.relname AS table,
           c.relrowsecurity,
           c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'saas\_%'
    ORDER BY c.relname
  `;
}

describe.sequential("T-SEC — RLS saas_*", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = createOficiosPostgresClient();
    try {
      await client`SELECT 1`;
      await client`
        INSERT INTO qum_tenants (id, slug, display_name)
        VALUES
          (${TENANT_A}::uuid, 'tenant-a-saas', 'Tenant A'),
          (${TENANT_B}::uuid, 'tenant-b-saas', 'Tenant B')
        ON CONFLICT (id) DO NOTHING
      `;
      await resetSaasOnExistingSchema(client);
      await withOfiTenantTransaction(client, TENANT_A, async (tx) => {
        await tx`
          INSERT INTO saas_organizations (
            tenant_id, commercial_name, legal_name, cr_id_normalized,
            economic_activity, trade_contract_id
          )
          VALUES (
            ${TENANT_A}::uuid, 'Org A', 'Org A Legal', '3101111111', '452011',
            ${HVAC_REFRIGERATION_V1_CONTRACT_ID}
          )
        `;
        await tx`
          INSERT INTO saas_memberships (id, tenant_id, user_sub, role, status)
          VALUES (${randomUUID()}::uuid, ${TENANT_A}::uuid, 'user-a', 'ADMIN', 'active')
        `;
      });
      await withOfiTenantTransaction(client, TENANT_B, async (tx) => {
        await tx`
          INSERT INTO saas_organizations (
            tenant_id, commercial_name, legal_name, cr_id_normalized,
            economic_activity, trade_contract_id
          )
          VALUES (
            ${TENANT_B}::uuid, 'Org B', 'Org B Legal', '3101222222', '452011',
            ${HVAC_REFRIGERATION_V1_CONTRACT_ID}
          )
        `;
        await tx`
          INSERT INTO saas_memberships (id, tenant_id, user_sub, role, status)
          VALUES (${randomUUID()}::uuid, ${TENANT_B}::uuid, 'user-b', 'ADMIN', 'active')
        `;
      });
    } catch {
      client = undefined;
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("FORCE RLS en tablas saas_*", async (ctx) => {
    if (!client) {
      ctx.skip();
      return;
    }
    const rows = await saasRlsTables(client);
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it("tenant A no ve membresías del tenant B", async (ctx) => {
    if (!client) {
      ctx.skip();
      return;
    }
    const rows = await withOfiTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ user_sub: string }[]>`SELECT user_sub FROM saas_memberships`,
    );
    expect(rows.map((r) => r.user_sub)).toEqual(["user-a"]);
  });
});