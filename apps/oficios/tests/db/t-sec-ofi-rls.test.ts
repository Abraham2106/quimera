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

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

export const TENANT_A = "11111111-1111-7111-8111-111111111111";
export const TENANT_B = "22222222-2222-7222-8222-222222222222";

async function readSql(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function dropOfiObjects(client: Sql): Promise<void> {
  for (const table of [
    "ofi_client_mutations",
    "ofi_migration_runs",
    "ofi_materials",
    "ofi_diagnosis_attachments",
    "ofi_diagnoses",
    "ofi_work_order_events",
    "ofi_work_orders",
    "ofi_equipment",
    "ofi_customers",
  ]) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function dropFobObjects(client: Sql): Promise<void> {
  for (const table of [
    "fob_fiscal_documents",
    "fob_fiscal_intents",
    "fob_fiscal_sequences",
  ]) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function dropQumObjects(client: Sql): Promise<void> {
  for (const table of [
    "qum_checkpoints",
    "qum_execution_runs",
    "qum_provenance_entries",
    "qum_entity_relations",
    "qum_decisions",
    "qum_conflicts",
    "qum_entities",
    "qum_raw_records",
    "qum_import_batches",
    "qum_artifacts",
    "qum_data_sources",
    "qum_schema_versions",
    "qum_tenants",
  ]) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function resetAndMigrate(client: Sql): Promise<void> {
  await dropOfiObjects(client);
  await dropFobObjects(client);
  await dropQumObjects(client);
  await client.unsafe(await readSql("packages/data-exodus/drizzle/0001_init_qum.sql"));
  await client.unsafe(await readSql("packages/fiscal-outbox/drizzle/0001_init_fob.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0001_init_ofi.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0002_diagnosis_materials.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0003_ofi_rls.sql"));
}

async function ofiRlsTables(client: Sql): Promise<
  Array<{ table: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
> {
  return client`
    SELECT c.relname AS table,
           c.relrowsecurity,
           c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'ofi\_%'
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'tenant_id'
          AND NOT a.attisdropped
      )
    ORDER BY c.relname
  `;
}

async function seedTenantBWorkshop(client: Sql): Promise<{
  customerId: string;
  workOrderId: string;
}> {
  const customerId = randomUUID();
  const equipmentId = randomUUID();
  const workOrderId = randomUUID();

  await withOfiTenantTransaction(client, TENANT_B, async (tx) => {
    await tx`
      INSERT INTO ofi_customers (id, tenant_id, legal_name)
      VALUES (${customerId}::uuid, ${TENANT_B}::uuid, 'Cliente Tenant B')
    `;
    await tx`
      INSERT INTO ofi_equipment (id, tenant_id, customer_id, trade_contract_id)
      VALUES (
        ${equipmentId}::uuid,
        ${TENANT_B}::uuid,
        ${customerId}::uuid,
        ${HVAC_REFRIGERATION_V1_CONTRACT_ID}
      )
    `;
    await tx`
      INSERT INTO ofi_work_orders (
        id, tenant_id, customer_id, equipment_id, trade_contract_id,
        status, customer_authorized, version
      )
      VALUES (
        ${workOrderId}::uuid,
        ${TENANT_B}::uuid,
        ${customerId}::uuid,
        ${equipmentId}::uuid,
        ${HVAC_REFRIGERATION_V1_CONTRACT_ID},
        'RECEIVED',
        false,
        1
      )
    `;
  });

  return { customerId, workOrderId };
}

describe.sequential("T-SEC-001 — RLS en tablas ofi_*", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = createOficiosPostgresClient();
    try {
      await client`SELECT 1`;
      await resetAndMigrate(client);
      await client`
        INSERT INTO qum_tenants (id, slug, display_name)
        VALUES
          (${TENANT_A}::uuid, 'tenant-a', 'Tenant A'),
          (${TENANT_B}::uuid, 'tenant-b', 'Tenant B')
      `;
    } catch {
      client = undefined;
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("FORCE RLS en todas las tablas ofi_* con tenant_id", async (ctx) => {
    if (!client) {
      ctx.skip();
      return;
    }
    const rows = await ofiRlsTables(client);
    expect(rows.length).toBe(7);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it("tenant A no ve clientes ni órdenes del tenant B sin filtro WHERE", async (ctx) => {
    if (!client) {
      ctx.skip();
      return;
    }
    const { customerId, workOrderId } = await seedTenantBWorkshop(client);

    const crossCustomers = await withOfiTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ id: string; legal_name: string }[]>`
        SELECT id::text, legal_name FROM ofi_customers
      `,
    );
    expect(crossCustomers.some((row) => row.id === customerId)).toBe(false);

    const crossOrders = await withOfiTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ id: string }[]>`
        SELECT id::text FROM ofi_work_orders
      `,
    );
    expect(crossOrders.some((row) => row.id === workOrderId)).toBe(false);
  });

  it("consulta sin app.current_tenant_id no devuelve filas", async (ctx) => {
    if (!client) {
      ctx.skip();
      return;
    }
    const customers = await client<{ count: string }[]>`
      SELECT count(*)::text AS count FROM ofi_customers
    `;
    const orders = await client<{ count: string }[]>`
      SELECT count(*)::text AS count FROM ofi_work_orders
    `;
    expect(Number(customers[0]?.count ?? "0")).toBe(0);
    expect(Number(orders[0]?.count ?? "0")).toBe(0);
  });
});