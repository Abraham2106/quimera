import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Sql } from "postgres";

import {
  applyFobFiscalCredentialsMigration,
  applyFobMigration,
  applyFobRlsMigration,
  dropFobObjects,
} from "../../src/db/migrate.js";
import { createPostgresClient, withFobTenantTransaction } from "../../src/db/connection.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataExodusRoot = path.resolve(packageRoot, "../data-exodus");

export const TENANT_A = "11111111-1111-7111-8111-111111111111";

export async function readFobMigrationSql(): Promise<string> {
  return readFile(path.join(packageRoot, "drizzle/0001_init_fob.sql"), "utf8");
}

export async function readFobRlsMigrationSql(): Promise<string> {
  return readFile(path.join(packageRoot, "drizzle/0002_fob_rls.sql"), "utf8");
}

export async function readFobFiscalCredentialsMigrationSql(): Promise<string> {
  return readFile(path.join(packageRoot, "drizzle/0003_fob_fiscal_credentials.sql"), "utf8");
}

export async function readQumMigrationSql(): Promise<string> {
  return readFile(
    path.join(dataExodusRoot, "drizzle/0001_init_qum.sql"),
    "utf8",
  );
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

export async function resetFobSchema(): Promise<Sql> {
  const client = createPostgresClient();
  await dropFobObjects(client);
  await dropQumObjects(client);
  const qumSql = await readQumMigrationSql();
  await client.unsafe(qumSql);
  const fobSql = await readFobMigrationSql();
  await applyFobMigration(client, fobSql);
  const rlsSql = await readFobRlsMigrationSql();
  await applyFobRlsMigration(client, rlsSql);
  const credSql = await readFobFiscalCredentialsMigrationSql();
  await applyFobFiscalCredentialsMigration(client, credSql);
  return client;
}

export async function seedTenant(
  client: Sql,
  tenantId = TENANT_A,
  slug = `tenant-${tenantId.slice(0, 8)}`,
): Promise<void> {
  await client`
    INSERT INTO qum_tenants (id, slug, display_name)
    VALUES (${tenantId}::uuid, ${slug}, ${`Tenant ${slug}`})
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function countIntents(client: Sql, tenantId: string): Promise<number> {
  const rows = await withFobTenantTransaction(client, tenantId, async (tx) =>
    tx<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM fob_fiscal_intents
      WHERE tenant_id = ${tenantId}::uuid
    `,
  );
  return Number(rows[0]?.count ?? "0");
}