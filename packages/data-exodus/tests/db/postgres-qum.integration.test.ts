import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { applyInitMigration, dropQumObjects } from "../../src/db/index.js";
import {
  findOtherTenantRow,
  insertDataSource,
  listDataSourceNames,
  readInitMigrationSql,
  resetAndMigrate,
  rlsEnabledTables,
  seedTenants,
  tableExists,
  TENANT_A,
  TENANT_B,
} from "./helpers.js";

const EXPECTED_TABLES = [
  "qum_tenants",
  "qum_schema_versions",
  "qum_data_sources",
  "qum_artifacts",
  "qum_import_batches",
  "qum_raw_records",
  "qum_entities",
  "qum_conflicts",
  "qum_decisions",
  "qum_entity_relations",
  "qum_provenance_entries",
  "qum_execution_runs",
  "qum_checkpoints",
] as const;

describe.sequential("PostgreSQL qum_* — migración y RLS", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetAndMigrate();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("QG-04: SQL forward-only sin ON DELETE CASCADE", async () => {
    const sql = await readInitMigrationSql();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS qum_tenants");
    expect(sql).not.toMatch(/ON DELETE CASCADE/i);
  });

  it("QG-04: crea las 13 tablas qum_*", async () => {
    if (!client) throw new Error("client not initialized");
    for (const table of EXPECTED_TABLES) {
      expect(await tableExists(client, table)).toBe(true);
    }
  });

  it("QG-04: RLS + FORCE en tablas con tenant_id", async () => {
    if (!client) throw new Error("client not initialized");
    const rows = await rlsEnabledTables(client);
    expect(rows.length).toBe(10);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it("T-SEC-001: tenant A no ve filas de tenant B", async () => {
    if (!client) throw new Error("client not initialized");
    await seedTenants(client);
    await insertDataSource(client, TENANT_A, "source-a");
    await insertDataSource(client, TENANT_B, "source-b");

    const namesA = await listDataSourceNames(client, TENANT_A);
    expect(namesA).toEqual(["source-a"]);
    expect(namesA).not.toContain("source-b");

    const crossRead = await findOtherTenantRow(client, TENANT_A, TENANT_B);
    expect(crossRead).toBe(false);
  });

  it("QG-04: reaplicación tras DROP controlado de qum_*", async () => {
    if (!client) throw new Error("client not initialized");
    await dropQumObjects(client);
    const sql = await readInitMigrationSql();
    await applyInitMigration(client, sql);
    expect(await tableExists(client, "qum_entities")).toBe(true);
  });
});