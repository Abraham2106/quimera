import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import type { Sql } from "postgres";

import {
  applyInitMigration,
  createDb,
  createPostgresClient,
  dropQumObjects,
  INIT_MIGRATION_SQL_PATH,
  qumDataSources,
  qumTenants,
  withTenantTransaction,
} from "../../src/db/index.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export async function readInitMigrationSql(): Promise<string> {
  return readFile(path.join(packageRoot, INIT_MIGRATION_SQL_PATH), "utf8");
}

export const TENANT_A = "11111111-1111-7111-8111-111111111111";
export const TENANT_B = "22222222-2222-7222-8222-222222222222";

export async function resetAndMigrate(): Promise<Sql> {
  const client = createPostgresClient();
  await dropQumObjects(client);
  const sql = await readInitMigrationSql();
  await applyInitMigration(client, sql);
  return client;
}

export async function seedTenants(client: Sql): Promise<void> {
  const db = createDb(client);
  await db.insert(qumTenants).values([
    {
      id: TENANT_A,
      slug: "tenant-a",
      displayName: "Tenant A",
    },
    {
      id: TENANT_B,
      slug: "tenant-b",
      displayName: "Tenant B",
    },
  ]);
}

export async function insertDataSource(
  client: Sql,
  tenantId: string,
  name: string,
): Promise<string> {
  const id = randomUUID();
  await withTenantTransaction(client, tenantId, async (db) => {
    await db.insert(qumDataSources).values({
      id,
      tenantId,
      name,
      sourceKind: "csv",
    });
  });
  return id;
}

export async function listDataSourceNames(
  client: Sql,
  tenantId: string,
): Promise<string[]> {
  return withTenantTransaction(client, tenantId, async (db) => {
    const rows = await db.select({ name: qumDataSources.name }).from(qumDataSources);
    return rows.map((r) => r.name);
  });
}

export async function countAllDataSourcesUnscoped(client: Sql): Promise<number> {
  const rows = await client<{ count: string }[]>`
    SELECT count(*)::text AS count FROM qum_data_sources
  `;
  return Number(rows[0]?.count ?? "0");
}

export async function rlsEnabledTables(client: Sql): Promise<
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
      AND c.relname LIKE 'qum_%'
      AND c.relname NOT IN ('qum_tenants', 'qum_schema_versions')
    ORDER BY c.relname
  `;
}

export async function tableExists(client: Sql, name: string): Promise<boolean> {
  const rows = await client<{ reg: string | null }[]>`
    SELECT to_regclass(${`public.${name}`})::text AS reg
  `;
  return rows[0]?.reg !== null;
}

export async function findOtherTenantRow(
  client: Sql,
  tenantId: string,
  otherTenantId: string,
): Promise<boolean> {
  let visible = false;
  await withTenantTransaction(client, tenantId, async (db) => {
    const rows = await db
      .select()
      .from(qumDataSources)
      .where(eq(qumDataSources.tenantId, otherTenantId));
    visible = rows.length > 0;
  });
  return visible;
}