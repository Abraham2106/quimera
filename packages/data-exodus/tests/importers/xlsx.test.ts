import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Sql } from "postgres";

import {
  qumArtifacts,
  qumDataSources,
  qumRawRecords,
  withTenantTransaction,
} from "../../src/db/index.js";
import {
  XlsxSourceImporter,
  assertXlsxZipNotBomb,
} from "../../src/importers/xlsx.js";
import { FsArtifactStore } from "../../src/storage/fs-artifact-store.js";
import { resetAndMigrate, seedTenants, TENANT_A } from "../db/helpers.js";

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

async function insertXlsxDataSource(client: Sql, tenantId: string, name: string): Promise<string> {
  const id = randomUUID();
  await withTenantTransaction(client, tenantId, async (db) => {
    await db.insert(qumDataSources).values({
      id,
      tenantId,
      name,
      sourceKind: "xlsx",
    });
  });
  return id;
}

async function writeWorkbook(filePath: string, build: (wb: ExcelJS.Workbook) => void): Promise<string> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

/** Minimal ZIP with inflated central-directory uncompressed sizes (zip-bomb metadata). */
function craftZipBombBuffer(): Buffer {
  const filename = Buffer.from("payload.bin", "utf8");
  const compressed = Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]);
  const localHeader = Buffer.alloc(30 + filename.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(60 * 1024 * 1024, 22);
  localHeader.writeUInt16LE(filename.length, 26);
  localHeader.writeUInt16LE(0, 28);
  filename.copy(localHeader, 30);

  const central = Buffer.alloc(46 + filename.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt32LE(compressed.length, 18);
  central.writeUInt32LE(60 * 1024 * 1024, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt32LE(30 + filename.length, 38);
  filename.copy(central, 46);

  const eocd = Buffer.alloc(22);
  const centralOffset = localHeader.length + compressed.length;
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, compressed, central, eocd]);
}

describe.sequential("T-DATA-002 — importador XLSX multi-hoja", () => {
  let client: Sql;
  let casRoot: string;
  let fixtureDir: string;
  let sourceId: string;
  let importer: XlsxSourceImporter;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    await seedSchemaVersion(client);
    sourceId = await insertXlsxDataSource(client, TENANT_A, "clientes_xlsx");
  });

  afterAll(async () => {
    await importer?.close();
    await client?.end();
  });

  beforeEach(async () => {
    casRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-xlsx-cas-"));
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-xlsx-fix-"));
    importer = new XlsxSourceImporter({
      client,
      artifactStore: new FsArtifactStore(casRoot),
    });
  });

  afterEach(async () => {
    await fs.rm(casRoot, { recursive: true, force: true });
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it("importa dos hojas con localizador xlsx:<hoja>!row:<n> y fechas ISO-8601", async () => {
    const filePath = path.join(fixtureDir, "clientes.xlsx");
    await writeWorkbook(filePath, (wb) => {
      const clientes = wb.addWorksheet("Clientes");
      clientes.addRow(["nombre", "fecha_alta"]);
      clientes.addRow(["Ana Costa", new Date("2024-06-15T12:00:00.000Z")]);

      const otros = wb.addWorksheet("Referidos");
      otros.addRow(["codigo", "monto"]);
      otros.addRow(["R-9", 4200]);
    });

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      originalName: "clientes.xlsx",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      result.data.counts.totalRowsSeen,
    ).toBe(
      result.data.counts.parsedOk +
        result.data.counts.parseErrors +
        result.data.counts.skippedEmpty,
    );

    const rows = await loadRawRecords(result.data.batchId);
    const ana = rows.find((r) => r.sourceLocator === "xlsx:Clientes!row:2");
    expect(ana?.parseStatus).toBe("OK");
    const fields = ana?.rawPayload.fields as Record<string, string>;
    expect(fields.nombre).toBe("Ana Costa");
    expect(fields.fecha_alta).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-06:00$/);

    const ref = rows.find((r) => r.sourceLocator === "xlsx:Referidos!row:2");
    expect(ref?.parseStatus).toBe("OK");
    expect((ref?.rawPayload.fields as Record<string, number>).monto).toBe(4200);
  });

  it("emite WARN_XLSX_UNCACHED_FORMULA para fórmulas sin valor cacheado", async () => {
    const filePath = path.join(fixtureDir, "formulas.xlsx");
    await writeWorkbook(filePath, (wb) => {
      const ws = wb.addWorksheet("Calc");
      ws.addRow(["col_a", "col_b", "suma"]);
      ws.getCell("A2").value = 10;
      ws.getCell("B2").value = 32;
      ws.getCell("C2").value = { formula: "A2+B2" };
    });

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === "WARN_XLSX_UNCACHED_FORMULA")).toBe(true);

    const rows = await loadRawRecords(result.data.batchId);
    const row = rows.find((r) => r.sourceLocator === "xlsx:Calc!row:2");
    expect(row?.rawPayload.formulas).toBeTruthy();
  });

  it("normaliza número serial de Excel con formato de fecha a ISO-8601", async () => {
    const filePath = path.join(fixtureDir, "serial-date.xlsx");
    const serial = 45459;
    await writeWorkbook(filePath, (wb) => {
      const ws = wb.addWorksheet("Fechas");
      ws.addRow(["evento", "cuando"]);
      const row = ws.addRow(["Cierre", serial]);
      row.getCell(2).numFmt = "yyyy-mm-dd";
    });

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await loadRawRecords(result.data.batchId);
    const evento = rows.find((r) => r.sourceLocator === "xlsx:Fechas!row:2");
    expect((evento?.rawPayload.fields as Record<string, string>).cuando).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("rechaza zip-bomb con ERR_SEC_ZIP_BOMB antes de parsear", async () => {
    const filePath = path.join(fixtureDir, "bomb.xlsx");
    const bomb = craftZipBombBuffer();
    await fs.writeFile(filePath, bomb);

    expect(() => assertXlsxZipNotBomb(new Uint8Array(bomb))).toThrow("ERR_SEC_ZIP_BOMB");

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_SEC_ZIP_BOMB");
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
});

describe.sequential("AT-02 — libro XLSX con CAS", () => {
  let client: Sql;
  let casRoot: string;
  let fixtureDir: string;
  let sourceId: string;
  let importer: XlsxSourceImporter;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    await seedSchemaVersion(client);
    sourceId = await insertXlsxDataSource(client, TENANT_A, "clientes");
  });

  afterAll(async () => {
    await importer?.close();
    await client?.end();
  });

  beforeEach(async () => {
    casRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-at02-cas-"));
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-at02-fix-"));
    importer = new XlsxSourceImporter({
      client,
      artifactStore: new FsArtifactStore(casRoot),
    });
  });

  afterEach(async () => {
    await fs.rm(casRoot, { recursive: true, force: true });
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it("persiste SHA-256 y filas no vacías en ambas hojas", async () => {
    const filePath = path.join(fixtureDir, "clientes.xlsx");
    await writeWorkbook(filePath, (wb) => {
      const h1 = wb.addWorksheet("Hoja A");
      h1.addRow(["id", "nombre"]);
      h1.addRow([1, "Cliente Uno"]);

      const h2 = wb.addWorksheet("Hoja B");
      h2.addRow(["id", "nota"]);
      h2.addRow([2, "Segundo cliente"]);
      h2.addRow([]);
    });

    const bytes = await fs.readFile(filePath);
    const expectedSha = createHash("sha256").update(bytes).digest("hex");

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      originalName: "clientes.xlsx",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.artifactSha256).toBe(expectedSha);
    expect(result.data.counts.parsedOk).toBe(2);

    const rows = await withTenantTransaction(client, TENANT_A, async (db) => {
      return db.select().from(qumRawRecords).where(eq(qumRawRecords.batchId, result.data.batchId));
    });
    expect(rows.map((r) => r.sourceLocator).sort()).toEqual(
      ["xlsx:Hoja A!row:2", "xlsx:Hoja B!row:2"].sort(),
    );

    const artifactRow = rows[0];
    const fromDb = await withTenantTransaction(client, TENANT_A, async (db) => {
      const found = await db
        .select()
        .from(qumArtifacts)
        .where(eq(qumArtifacts.id, artifactRow!.artifactId))
        .limit(1);
      return found[0];
    });
    expect(fromDb?.sha256).toBe(expectedSha);
  });
});