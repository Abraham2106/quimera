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
import { ERR_WORK_ORDER_APPROVAL_REQUIRED } from "../../src/domain/work-order-errors.js";
import { transitionWorkOrder } from "../../src/domain/work-order-fsm.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const TENANT_ID = "22222222-2222-7222-8222-222222222222";

async function readSql(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function dropOfiObjects(client: Sql): Promise<void> {
  const tables = [
    "ofi_client_mutations",
    "ofi_migration_runs",
    "ofi_materials",
    "ofi_diagnosis_attachments",
    "ofi_diagnoses",
    "ofi_work_order_events",
    "ofi_work_orders",
    "ofi_equipment",
    "ofi_customers",
  ];
  for (const table of tables) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function dropFobObjects(client: Sql): Promise<void> {
  const tables = [
    "fob_fiscal_credentials",
    "fob_fiscal_issuer_config",
    "fob_fiscal_documents",
    "fob_fiscal_intents",
    "fob_fiscal_sequences",
  ];
  for (const table of tables) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function dropQumObjects(client: Sql): Promise<void> {
  const tables = [
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
  ];
  for (const table of tables) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function resetSchema(client: Sql): Promise<void> {
  await dropOfiObjects(client);
  await dropFobObjects(client);
  await dropQumObjects(client);
  await client.unsafe(await readSql("packages/data-exodus/drizzle/0001_init_qum.sql"));
  await client.unsafe(
    await readSql("packages/fiscal-outbox/drizzle/0001_init_fob.sql"),
  );
  await client.unsafe(await readSql("apps/oficios/drizzle/0001_init_ofi.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0002_diagnosis_materials.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0003_ofi_rls.sql"));
}

describe("T-OFI-002 — integración PostgreSQL ofi_*", () => {
  let client: Sql;
  let dbAvailable = true;

  beforeAll(async () => {
    client = createOficiosPostgresClient();
    try {
      await client`SELECT 1`;
      await resetSchema(client);
      await client`
        INSERT INTO qum_tenants (id, slug, display_name)
        VALUES (${TENANT_ID}::uuid, 'ofi-pg-test', 'Ofi PG Test')
      `;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await dropOfiObjects(client);
    }
    await client.end({ timeout: 5 });
  });

  it("mantiene QUOTED al rechazar cierre sin aprobación", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }

    const customerId = randomUUID();
    const equipmentId = randomUUID();
    const workOrderId = randomUUID();

    await withOfiTenantTransaction(client, TENANT_ID, async (tx) => {
      await tx`
        INSERT INTO ofi_customers (id, tenant_id, legal_name)
        VALUES (${customerId}::uuid, ${TENANT_ID}::uuid, 'Cliente Prueba')
      `;
      await tx`
        INSERT INTO ofi_equipment (id, tenant_id, customer_id, trade_contract_id)
        VALUES (
          ${equipmentId}::uuid,
          ${TENANT_ID}::uuid,
          ${customerId}::uuid,
          ${HVAC_REFRIGERATION_V1_CONTRACT_ID}
        )
      `;
      await tx`
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
          ${workOrderId}::uuid,
          ${TENANT_ID}::uuid,
          ${customerId}::uuid,
          ${equipmentId}::uuid,
          ${HVAC_REFRIGERATION_V1_CONTRACT_ID},
          'QUOTED',
          false,
          1
        )
      `;
    });

    const rows = await withOfiTenantTransaction(
      client,
      TENANT_ID,
      async (tx) =>
        tx<
          {
            status: string;
            customer_authorized: boolean;
            version: string;
          }[]
        >`
          SELECT status, customer_authorized, version::text
          FROM ofi_work_orders
          WHERE id = ${workOrderId}::uuid
        `,
    );
    const row = rows[0];
    expect(row?.status).toBe("QUOTED");

    const decision = transitionWorkOrder({
      tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
      currentStatus: "QUOTED",
      targetStatus: "CLOSED",
      customerAuthorized: row?.customer_authorized ?? false,
      expectedVersion: Number(row?.version ?? "1"),
      actualVersion: Number(row?.version ?? "1"),
    });
    expect(decision).toMatchObject({
      ok: false,
      code: ERR_WORK_ORDER_APPROVAL_REQUIRED,
    });

    const after = await withOfiTenantTransaction(
      client,
      TENANT_ID,
      async (tx) =>
        tx<{ status: string }[]>`
          SELECT status FROM ofi_work_orders WHERE id = ${workOrderId}::uuid
        `,
    );
    expect(after[0]?.status).toBe("QUOTED");
  });
});