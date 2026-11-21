import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Sql } from "postgres";

import { qumRawRecords, withTenantTransaction } from "../../src/db/index.js";
import { JsonSourceImporter } from "../../src/importers/json.js";
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

async function writeFixture(dir: string, name: string, content: string): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

describe.sequential("T-DATA-014 — importador JSON sobre SourceImporterPort", () => {
  let client: Sql;
  let casRoot: string;
  let fixtureDir: string;
  let sourceId: string;
  let importer: JsonSourceImporter;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    await seedSchemaVersion(client);
    sourceId = await insertDataSource(client, TENANT_A, "ventas_json");
  });

  afterAll(async () => {
    await importer?.close();
    await client?.end();
  });

  beforeEach(async () => {
    casRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-json-cas-"));
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-json-fix-"));
    importer = new JsonSourceImporter({
      client,
      artifactStore: new FsArtifactStore(casRoot),
    });
  });

  afterEach(async () => {
    await fs.rm(casRoot, { recursive: true, force: true });
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it("importa arreglo de objetos con montos en string", async () => {
    const body = JSON.stringify([
      { cedula: "9001000999", monto: "1250050", nota: "factura demo" },
      { cedula: "9001000888", monto: "890000", nota: "segunda fila" },
    ]);
    const filePath = await writeFixture(fixtureDir, "ventas.json", body);

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
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
    const first = rows.find((r) => r.sourceLocator === "json:index:1");
    expect(first?.parseStatus).toBe("OK");
    expect((first?.rawPayload.fields as Record<string, string>).monto).toBe("1250050");
    expect((first?.rawPayload.fields as Record<string, string>).cedula).toBe("9001000999");
  });

  it("JSON malformado devuelve OperationResult de error", async () => {
    const filePath = await writeFixture(fixtureDir, "bad.json", "[{");

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_PARSE_JSON");
  });

  it("segunda corrida idempotente reporta inserted = 0", async () => {
    const body = JSON.stringify([{ sku: "A-1", cantidad: "3" }]);
    const filePath = await writeFixture(fixtureDir, "idem.json", body);

    const first = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.counts.inserted).toBe(1);

    const before = await countRawRecordsForTenant();
    const second = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.idempotentReplay).toBe(true);
    expect(second.data.counts.inserted).toBe(0);
    expect(second.data.counts.parsedOk).toBe(1);
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