import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Sql } from "postgres";

import {
  createOficiosPostgresClient,
  withOfiTenantTransaction,
} from "../../src/db/connection.js";
import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "../../src/domain/hvac-refrigeration-v1.js";
import type { OficiosRole } from "../../src/api/context.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

export const TENANT_ID = "22222222-2222-7222-8222-222222222222";

async function readSql(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function dropSaasObjects(client: Sql): Promise<void> {
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

export async function resetApiSchema(client: Sql): Promise<void> {
  await dropSaasObjects(client);
  await dropOfiObjects(client);
  await dropFobObjects(client);
  await dropQumObjects(client);
  await client.unsafe(await readSql("packages/data-exodus/drizzle/0001_init_qum.sql"));
  await client.unsafe(await readSql("packages/data-exodus/drizzle/0002_evidence_append_only.sql"));
  await client.unsafe(await readSql("packages/fiscal-outbox/drizzle/0001_init_fob.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0001_init_ofi.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0002_diagnosis_materials.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0003_ofi_rls.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0004_saas_b2b_onboarding.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0005_web_workbench.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0006_saas_billing.sql"));
  await client.unsafe(await readSql("apps/oficios/drizzle/0007_saas_audit.sql"));
  await client`
    INSERT INTO qum_tenants (id, slug, display_name)
    VALUES (${TENANT_ID}::uuid, 'ofi-api-test', 'Ofi API Test')
    ON CONFLICT (id) DO NOTHING
  `;
}

export function apiTestHeaders(role: OficiosRole = "OPERATOR"): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-tenant-id": TENANT_ID,
    "x-test-role": role,
    "x-actor-id": "api-test-operator",
  };
}

export async function seedCustomerEquipment(
  client: Sql,
): Promise<{ customerId: string; equipmentId: string }> {
  const customerId = randomUUID();
  const equipmentId = randomUUID();
  await withOfiTenantTransaction(client, TENANT_ID, async (tx) => {
    await tx`
      INSERT INTO ofi_customers (id, tenant_id, legal_name)
      VALUES (${customerId}::uuid, ${TENANT_ID}::uuid, 'Cliente API')
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
  });
  return { customerId, equipmentId };
}

export async function setupApiDb(): Promise<{ client: Sql; dbAvailable: boolean }> {
  const client = createOficiosPostgresClient();
  try {
    await client`SELECT 1`;
    await resetApiSchema(client);
    return { client, dbAvailable: true };
  } catch {
    return { client, dbAvailable: false };
  }
}