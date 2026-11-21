import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Sql } from "postgres";

import { qumRawRecords, withTenantTransaction } from "../../src/db/index.js";
import { SqliteSourceImporter } from "../../src/importers/sqlite.js";
import { FsArtifactStore } from "../../src/storage/fs-artifact-store.js";
import {
  insertDataSource,
  resetAndMigrate,
  seedTenants,
  TENANT_A,
} from "../db/helpers.js";

const SCHEMA_V1 = "33333333-3333-7333-8333-333333333333";

async function seedSchemaVersion(client: Sql): Promise<void> {
  await client`
    INSERT INTO qum_schema_versions (id, schema_name, semver, sha256, json_schema)
    VALUES (
      ${SCHEMA_V1}::uuid,
      'exodus-raw',
      '1.0.0',
      ${"a".repeat(64)},
      '{}'::jsonb
    )
    ON CONFLICT DO NOTHING
  `;
}

async function writeLegacySqlite(
  dir: string,
  name: string,
  batchTag = "default",
): Promise<string> {
  const filePath = path.join(dir, name);
  const db = new DatabaseSync(filePath);
  try {
    db.exec(`
      CREATE TABLE legacy_ventas (
        cedula TEXT NOT NULL,
        monto TEXT NOT NULL,
        nota TEXT
      );
      INSERT INTO legacy_ventas (cedula, monto, nota) VALUES
        ('9001000999', '1250050', 'registro sintético uno ${batchTag}'),
        ('9001000888', '890000', 'registro sintético dos ${batchTag}');
    `);
  } finally {
    db.close();
  }
  return filePath;
}

describe.sequential("T-DATA-014 — importador SQLite legacy sobre SourceImporterPort", () => {
  let client: Sql;
  let casRoot: string;
  let fixtureDir: string;
  let sourceId: string;
  let importer: SqliteSourceImporter;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    await seedSchemaVersion(client);
    sourceId = await insertDataSource(client, TENANT_A, "ventas_sqlite");
  });

  afterAll(async () => {
    await importer?.close();
    await client?.end();
  });

  beforeEach(async () => {
    casRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-sqlite-cas-"));
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-sqlite-fix-"));
    importer = new SqliteSourceImporter({
      client,
      artifactStore: new FsArtifactStore(casRoot),
    });
  });

  afterEach(async () => {
    await fs.rm(casRoot, { recursive: true, force: true });
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it("lee tabla legacy en modo solo lectura", async () => {
    const filePath = await writeLegacySqlite(fixtureDir, "legacy.sqlite");

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      table: "legacy_ventas",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.counts.parsedOk).toBe(2);
    expect(
      result.data.counts.totalRowsSeen,
    ).toBe(
      result.data.counts.parsedOk +
        result.data.counts.parseErrors +
        result.data.counts.skippedEmpty,
    );

    const rows = await loadRawRecords(result.data.batchId);
    const first = rows.find((r) => r.sourceLocator === "sqlite:legacy_ventas:row:1");
    expect(first?.parseStatus).toBe("OK");
    expect((first?.rawPayload.fields as Record<string, string>).monto).toBe("1250050");
    expect((first?.rawPayload.fields as Record<string, string>).cedula).toBe("9001000999");
  });

  it("segunda corrida idempotente reporta inserted = 0", async () => {
    const filePath = await writeLegacySqlite(fixtureDir, "idem.sqlite", "idem-batch-2");

    const first = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      table: "legacy_ventas",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.counts.inserted).toBe(2);

    const before = await countRawRecordsForTenant();
    const second = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      table: "legacy_ventas",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.idempotentReplay).toBe(true);
    expect(second.data.counts.inserted).toBe(0);
    expect(second.data.counts.parsedOk).toBe(2);
    expect(await countRawRecordsForTenant()).toBe(before);
  });

  async function loadRawRecords(batchId: string) {
    return withTenantTransaction(client, TENANT_A, async (db) => {
      return db
        .select()
        .from(qumRawRecords)
        .where(eq(qumRawRecords.batchId, batchId))
        .orderBy(qumRawRecords.sourceLocator);
    });
  }

  async function countRawRecordsForTenant(): Promise<number> {
    return withTenantTransaction(client, TENANT_A, async (db) => {
      const rows = await db.select({ id: qumRawRecords.id }).from(qumRawRecords);
      return rows.length;
    });
  }
});