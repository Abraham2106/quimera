import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Sql } from "postgres";

import {
  qumArtifacts,
  qumRawRecords,
  withTenantTransaction,
} from "../../src/db/index.js";
import { CsvSourceImporter } from "../../src/importers/csv.js";
import { neutralizeCsvFormulaPrefix } from "../../src/importers/csv-export.js";
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

async function writeFixture(
  dir: string,
  name: string,
  content: string | Uint8Array,
): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

describe.sequential("T-DATA-001 — importador CSV sin pérdida silenciosa", () => {
  let client: Sql;
  let casRoot: string;
  let fixtureDir: string;
  let sourceId: string;
  let importer: CsvSourceImporter;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    await seedSchemaVersion(client);
    sourceId = await insertDataSource(client, TENANT_A, "ventas_csv");
  });

  afterAll(async () => {
    await importer?.close();
    await client?.end();
  });

  beforeEach(async () => {
    casRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-csv-cas-"));
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-csv-fix-"));
    importer = new CsvSourceImporter({
      client,
      artifactStore: new FsArtifactStore(casRoot),
    });
  });

  afterEach(async () => {
    await fs.rm(casRoot, { recursive: true, force: true });
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it("importa UTF-8 con coma y preserva tildes", async () => {
    const csv = [
      "nombre,monto,nota",
      "José,1200,descripción íntegra",
      "María,900,áéíóú",
    ].join("\n");
    const filePath = await writeFixture(fixtureDir, "utf8-comma.csv", csv);

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      delimiter: ",",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.counts.totalRowsSeen).toBe(2);
    expect(result.data.counts.parsedOk).toBe(2);
    expect(
      result.data.counts.totalRowsSeen,
    ).toBe(
      result.data.counts.parsedOk +
        result.data.counts.parseErrors +
        result.data.counts.skippedEmpty,
    );

    const rows = await loadRawRecords(result.data.batchId);
    const jose = rows.find((r) => r.sourceLocator === "csv:line:2");
    expect(jose?.parseStatus).toBe("OK");
    expect((jose?.rawPayload.fields as Record<string, string>).nombre).toBe("José");
  });

  it("importa UTF-8 con BOM", async () => {
    const body = "cliente\nAna García\n";
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const filePath = await writeFixture(
      fixtureDir,
      "utf8-bom.csv",
      Buffer.concat([bom, Buffer.from(body, "utf8")]),
    );

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = await loadRawRecords(result.data.batchId);
    const ana = rows.find((r) => r.sourceLocator === "csv:line:2");
    expect((ana?.rawPayload.fields as Record<string, string>).cliente).toBe("Ana García");
    expect(ana?.rawPayload.encoding).toBe("utf-8-bom");
  });

  it("importa Latin-1 con punto y coma (QR-DATA-003)", async () => {
    const csv = [
      "cliente;monto",
      "José Ñúñez;₡15000",
      "descripción con tilde;100",
    ]
      .join("\n");
    const bytes = Buffer.from(csv, "latin1");
    const filePath = await writeFixture(fixtureDir, "latin1-semi.csv", bytes);

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      delimiter: ";",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await loadRawRecords(result.data.batchId);
    const row = rows.find((r) => r.sourceLocator === "csv:line:2");
    expect(row?.parseStatus).toBe("OK");
    expect((row?.rawPayload.fields as Record<string, string>).cliente).toBe("José Ñúñez");
    expect(row?.rawPayload.encoding).toBe("latin1");
  });

  it("importa delimitador tab", async () => {
    const csv = "col_a\tcol_b\nuno\tdos\n";
    const filePath = await writeFixture(fixtureDir, "tab.csv", csv);
    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      delimiter: "\t",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.counts.parsedOk).toBe(1);
    const rows = await loadRawRecords(result.data.batchId);
    expect(rows[0]?.sourceLocator).toBe("csv:line:2");
  });

  it("registra filas malformadas como ERROR sin descartar", async () => {
    const csv = [
      "id,valor",
      "1,ok",
      '2,"comillas sin cerrar',
      "3,also-ok",
      "",
      "4,final",
    ].join("\n");
    const filePath = await writeFixture(fixtureDir, "malformed.csv", csv);

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.counts.parseErrors).toBeGreaterThanOrEqual(1);
    expect(result.data.counts.skippedEmpty).toBe(1);
    expect(
      result.data.counts.totalRowsSeen,
    ).toBe(
      result.data.counts.parsedOk +
        result.data.counts.parseErrors +
        result.data.counts.skippedEmpty,
    );

    const rows = await loadRawRecords(result.data.batchId);
    const bad = rows.find((r) => r.sourceLocator === "csv:line:3");
    expect(bad?.parseStatus).toBe("ERROR");
    expect(bad?.parseError).toBeTruthy();
  });

  it("segunda corrida idempotente reporta inserted = 0", async () => {
    const csv = "sku,cant\nA-1,3\n";
    const filePath = await writeFixture(fixtureDir, "idem.csv", csv);

    const first = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

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
    expect(await countRawRecordsForTenant()).toBe(before);
  });

  it("T-SEC-003: neutraliza prefijos = + - @ al exportar CSV", () => {
    expect(neutralizeCsvFormulaPrefix("=CMD|'/C calc'!A0")).toBe("'=CMD|'/C calc'!A0");
    expect(neutralizeCsvFormulaPrefix("+123")).toBe("'+123");
    expect(neutralizeCsvFormulaPrefix("-sum(A1)")).toBe("'-sum(A1)");
    expect(neutralizeCsvFormulaPrefix("@import")).toBe("'@import");
    expect(neutralizeCsvFormulaPrefix("texto normal")).toBe("texto normal");
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

describe.sequential("AT-01 — ventas CSV con Latin-1, malformadas y CAS", () => {
  let client: Sql;
  let casRoot: string;
  let fixtureDir: string;
  let sourceId: string;
  let importer: CsvSourceImporter;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    await seedSchemaVersion(client);
    sourceId = await insertDataSource(client, TENANT_A, "ventas_2025");
  });

  afterAll(async () => {
    await importer?.close();
    await client?.end();
  });

  beforeEach(async () => {
    casRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-at01-cas-"));
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-at01-fix-"));
    importer = new CsvSourceImporter({
      client,
      artifactStore: new FsArtifactStore(casRoot),
    });
  });

  afterEach(async () => {
    await fs.rm(casRoot, { recursive: true, force: true });
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it("preserva SHA-256, tildes y conteo cuadrado con 2 PARSE_ERROR", async () => {
    const lines = [
      "factura;cliente;monto;nota",
      "F-100;José Pérez;12500.50;Pago recibido íntegro",
      "F-101;María Solís;8900;Descripción con Ñ",
      'F-102;"monto roto',
      'F-103;"otra fila rota',
      "F-104;Cliente Demo;4500;fila válida final",
    ];
    const body = `${lines.join("\n")}\n`;
    const bytes = Buffer.from(body, "latin1");
    const expectedSha = createHash("sha256").update(bytes).digest("hex");
    const filePath = await writeFixture(fixtureDir, "ventas_2025.csv", bytes);

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      originalName: "ventas_2025.csv",
      delimiter: ";",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.artifactSha256).toBe(expectedSha);
    expect(result.data.counts.parseErrors).toBe(2);
    expect(result.data.counts.parsedOk).toBe(3);
    expect(
      result.data.counts.totalRowsSeen,
    ).toBe(
      result.data.counts.parsedOk +
        result.data.counts.parseErrors +
        result.data.counts.skippedEmpty,
    );

    const rows = await withTenantTransaction(client, TENANT_A, async (db) => {
      return db
        .select()
        .from(qumRawRecords)
        .where(eq(qumRawRecords.batchId, result.data.batchId));
    });

    const errors = rows.filter((r) => r.parseStatus === "ERROR");
    expect(errors).toHaveLength(2);
    expect(errors.map((r) => r.sourceLocator).sort()).toEqual(
      ["csv:line:4", "csv:line:5"].sort(),
    );

    const jose = rows.find((r) => r.sourceLocator === "csv:line:2");
    expect((jose?.rawPayload.fields as Record<string, string>).cliente).toBe("José Pérez");

    const store = new FsArtifactStore(casRoot);
    const artifactRow = rows[0];
    expect(artifactRow).toBeTruthy();
    const fromDb = await withTenantTransaction(client, TENANT_A, async (db) => {
      const rows = await db
        .select()
        .from(qumArtifacts)
        .where(eq(qumArtifacts.id, artifactRow!.artifactId))
        .limit(1);
      return rows[0];
    });
    expect(fromDb?.sha256).toBe(expectedSha);
    const got = await store.get(fromDb!.storageUri);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(createHash("sha256").update(got.data).digest("hex")).toBe(expectedSha);
  });
});