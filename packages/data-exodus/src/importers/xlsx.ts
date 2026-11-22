import { Buffer as NodeBuffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import type {
  EvidenceArtifact,
  OperationResult,
  QuimeraError,
  QuimeraWarning,
} from "@quimera/core";
import { sha256CanonicalJson } from "@quimera/core";
import type { Sql } from "postgres";

import {
  createPostgresClient,
  qumArtifacts,
  qumImportBatches,
  qumRawRecords,
  withTenantTransaction,
  type QuimeraDb,
} from "../db/index.js";
import { FsArtifactStore } from "../storage/fs-artifact-store.js";
import { quimeraError } from "../storage/path-guards.js";
import { assertCountInvariant } from "./csv-parse-rows.js";
import {
  assertSafeObjectKey,
  createSafeRecord,
  sha256SafeCanonicalJson,
  toPlainJson,
} from "./safe-object.js";
import type {
  ImportCounts,
  SourceImporterPort,
  SourceImportRequest,
  SourceImportSummary,
} from "./types.js";

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIR_HEADER = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;

/** Default QR-SEC-003 limits for XLSX (zip) decompression. */
export const XLSX_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const XLSX_MAX_COMPRESSION_RATIO = 50;
/** Topes de iteración: una celda solitaria muy lejana no debe expandir la hoja. */
export const XLSX_MAX_COLUMNS = 1_024;
export const XLSX_MAX_ROWS_PER_SHEET = 100_000;

const WARN_XLSX_UNCACHED_FORMULA = "WARN_XLSX_UNCACHED_FORMULA";
const WARN_XLSX_ROW_LIMIT = "WARN_XLSX_ROW_LIMIT";

export type XlsxImportRequest = SourceImportRequest & {
  /** When omitted, every worksheet in the workbook is imported. */
  sheets?: string[];
  hasHeader?: boolean;
};

export type XlsxSourceImporterOptions = {
  client?: Sql;
  artifactStore: FsArtifactStore;
};

export type ParsedXlsxRow = {
  rowNumber: number;
  sheetName: string;
  sourceLocator: string;
  parseStatus: "OK" | "SKIPPED";
  rawPayload: Record<string, unknown>;
  recordHash: string;
};

function ok(
  data: SourceImportSummary,
  warnings: QuimeraWarning[],
): OperationResult<SourceImportSummary> {
  return { ok: true, data, warnings };
}

function fail(
  code: string,
  category: QuimeraError["category"],
  message: string,
  retryable: boolean,
  warnings: QuimeraWarning[] = [],
): OperationResult<never> {
  return {
    ok: false,
    error: quimeraError(code, category, message, retryable),
    warnings,
  };
}

function buildIdempotencyKey(
  tenantId: string,
  sourceId: string,
  artifactSha256: string,
): string {
  return sha256CanonicalJson({ tenantId, sourceId, artifactSha256, kind: "xlsx" });
}

function mapBatchCounts(
  batch: typeof qumImportBatches.$inferSelect,
  inserted: number,
): ImportCounts {
  return {
    totalRowsSeen: batch.totalRowsSeen,
    parsedOk: batch.parsedOk,
    parseErrors: batch.parseErrors,
    skippedEmpty: batch.skippedEmpty,
    inserted,
  };
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minEocd = 22;
  const maxComment = 0xffff;
  const start = Math.max(0, bytes.length - minEocd - maxComment);
  for (let i = bytes.length - minEocd; i >= start; i -= 1) {
    if (readU32LE(bytes, i) === ZIP_EOCD_SIGNATURE) {
      return i;
    }
  }
  return -1;
}

function sumCentralDirectoryUncompressed(bytes: Uint8Array): number | null {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    return null;
  }

  const entryCount = readU16LE(bytes, eocdOffset + 10);
  const centralDirOffset = readU32LE(bytes, eocdOffset + 16);
  if (centralDirOffset >= bytes.length) {
    return null;
  }

  let offset = centralDirOffset;
  let total = 0;
  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > bytes.length) {
      return null;
    }
    if (readU32LE(bytes, offset) !== ZIP_CENTRAL_DIR_HEADER) {
      return null;
    }
    const uncompSize = readU32LE(bytes, offset + 24);
    const nameLen = readU16LE(bytes, offset + 28);
    const extraLen = readU16LE(bytes, offset + 30);
    const commentLen = readU16LE(bytes, offset + 32);
    total += uncompSize;
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return total;
}

function sumLocalHeaderUncompressed(bytes: Uint8Array): number {
  let offset = 0;
  let total = 0;
  while (offset + 30 <= bytes.length) {
    const sig = readU32LE(bytes, offset);
    if (sig === ZIP_LOCAL_FILE_HEADER) {
      const compSize = readU32LE(bytes, offset + 18);
      const uncompSize = readU32LE(bytes, offset + 22);
      const nameLen = readU16LE(bytes, offset + 26);
      const extraLen = readU16LE(bytes, offset + 28);
      total += uncompSize;
      offset += 30 + nameLen + extraLen + compSize;
      continue;
    }
    if (sig === ZIP_CENTRAL_DIR_HEADER || sig === ZIP_EOCD_SIGNATURE) {
      break;
    }
    offset += 1;
  }
  return total;
}

/** QR-SEC-003: reject zip-bombs before Excel parsing. */
export function assertXlsxZipNotBomb(bytes: Uint8Array): void {
  if (bytes.length < 4) {
    throw new Error("ERR_SEC_ZIP_BOMB");
  }
  const magic = readU32LE(bytes, 0);
  if (magic !== ZIP_LOCAL_FILE_HEADER) {
    return;
  }

  const fromCentral = sumCentralDirectoryUncompressed(bytes);
  const totalUncompressed =
    fromCentral !== null && fromCentral > 0
      ? fromCentral
      : sumLocalHeaderUncompressed(bytes);

  if (totalUncompressed > XLSX_MAX_UNCOMPRESSED_BYTES) {
    throw new Error("ERR_SEC_ZIP_BOMB");
  }
  if (bytes.length > 0 && totalUncompressed / bytes.length > XLSX_MAX_COMPRESSION_RATIO) {
    throw new Error("ERR_SEC_ZIP_BOMB");
  }
}

function toCostaRicaIso(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-06:00`;
}

function excelSerialToDate(serial: number): Date {
  const epochUtc = Date.UTC(1899, 11, 30);
  return new Date(epochUtc + serial * 86_400_000);
}

function looksLikeDateNumFmt(numFmt: string): boolean {
  const lower = numFmt.toLowerCase();
  return (
    lower.includes("yy") ||
    lower.includes("dd") ||
    lower.includes("mm") ||
    lower.includes("h")
  );
}

function normalizePrimitive(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object" && value !== null && "text" in value) {
    const rich = value as { text?: string };
    return rich.text ?? null;
  }
  if (typeof value === "object" && value !== null && "error" in value) {
    return String((value as { error: string }).error);
  }
  return value;
}

type CellExtraction = {
  value: unknown;
  formula?: string;
  uncachedFormula: boolean;
};

function extractCell(
  cell: ExcelJS.Cell,
): CellExtraction {
  const raw = cell.value;
  if (raw && typeof raw === "object" && "formula" in raw) {
    const formulaVal = raw as ExcelJS.CellFormulaValue;
    const hasFormula = typeof formulaVal.formula === "string" && formulaVal.formula.length > 0;
    const result = formulaVal.result;
    const uncached =
      hasFormula &&
      (result === undefined ||
        result === null ||
        (typeof result === "object" && result !== null && "error" in result));
    let value: unknown = null;
    if (result instanceof Date) {
      value = toCostaRicaIso(result);
    } else if (typeof result === "number" && cell.numFmt && looksLikeDateNumFmt(cell.numFmt)) {
      value = toCostaRicaIso(excelSerialToDate(result));
    } else if (result !== undefined && result !== null) {
      value = normalizePrimitive(result);
    }
    return {
      value,
      formula: formulaVal.formula,
      uncachedFormula: uncached,
    };
  }

  if (raw instanceof Date) {
    return { value: toCostaRicaIso(raw), uncachedFormula: false };
  }
  if (typeof raw === "number" && cell.numFmt && looksLikeDateNumFmt(cell.numFmt)) {
    return { value: toCostaRicaIso(excelSerialToDate(raw)), uncachedFormula: false };
  }
  return { value: normalizePrimitive(raw), uncachedFormula: false };
}

function rowIsEmpty(values: Record<string, unknown>): boolean {
  return Object.values(values).every(
    (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === ""),
  );
}

function headerFromRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
): string[] {
  const row = worksheet.getRow(rowNumber);
  const headers: string[] = [];
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber > XLSX_MAX_COLUMNS) {
      return;
    }
    const label = String(cell.value ?? "").trim();
    let safeLabel = label.length > 0 ? label : `col_${colNumber - 1}`;
    try {
      assertSafeObjectKey(safeLabel);
    } catch {
      safeLabel = `col_${colNumber - 1}`;
    }
    headers[colNumber - 1] = safeLabel;
  });
  return headers;
}

function buildRowFields(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnNames: string[] | undefined,
): Record<string, unknown> {
  const row = worksheet.getRow(rowNumber);
  const fields = createSafeRecord<unknown>();
  const formulas: Record<string, string> = {};

  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber > XLSX_MAX_COLUMNS) {
      return;
    }
    const key = columnNames?.[colNumber - 1] ?? `col_${colNumber - 1}`;
    const extracted = extractCell(cell);
    fields[key] = extracted.value;
    if (extracted.formula) {
      formulas[key] = extracted.formula;
    }
  });

  return Object.keys(formulas).length > 0
    ? { ...fields, __formulas: formulas }
    : fields;
}

function collectUncachedFormulaCells(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnNames: string[] | undefined,
): Array<{ column: string; formula: string }> {
  const row = worksheet.getRow(rowNumber);
  const hits: Array<{ column: string; formula: string }> = [];
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber > XLSX_MAX_COLUMNS) {
      return;
    }
    const extracted = extractCell(cell);
    if (extracted.uncachedFormula && extracted.formula) {
      const column = columnNames?.[colNumber - 1] ?? `col_${colNumber - 1}`;
      hits.push({ column, formula: extracted.formula });
    }
  });
  return hits;
}

function sheetHasDataRow(worksheet: ExcelJS.Worksheet): boolean {
  let found = false;
  worksheet.eachRow({ includeEmpty: false }, () => {
    found = true;
  });
  return found;
}

function resolveHeaderRowNumber(worksheet: ExcelJS.Worksheet, hasHeader: boolean): number {
  if (!hasHeader) {
    return 0;
  }
  let headerRow = 1;
  let seen = false;
  worksheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
    if (!seen) {
      headerRow = rowNumber;
      seen = true;
    }
  });
  return headerRow;
}

export function parseXlsxWorkbook(
  workbook: ExcelJS.Workbook,
  options: { sheets?: string[]; hasHeader: boolean },
): { rows: ParsedXlsxRow[]; warnings: QuimeraWarning[] } {
  const warnings: QuimeraWarning[] = [];
  const warnUncached = (context: Record<string, unknown>) => {
    if (!warnings.some((w) => w.code === WARN_XLSX_UNCACHED_FORMULA)) {
      warnings.push({
        code: WARN_XLSX_UNCACHED_FORMULA,
        message: "Excel formula present without cached evaluated value",
        context,
      });
    }
  };

  const warnRowLimit = (context: Record<string, unknown>) => {
    if (!warnings.some((w) => w.code === WARN_XLSX_ROW_LIMIT)) {
      warnings.push({
        code: WARN_XLSX_ROW_LIMIT,
        message: "Worksheet row iteration limit reached; remaining rows were not imported",
        context,
      });
    }
  };

  const rows: ParsedXlsxRow[] = [];
  const targets = options.sheets?.length
    ? options.sheets
    : workbook.worksheets.map((ws) => ws.name);

  for (const sheetName of targets) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet || !sheetHasDataRow(worksheet)) {
      continue;
    }

    const headerRowNumber = resolveHeaderRowNumber(worksheet, options.hasHeader);
    const columnNames = options.hasHeader ? headerFromRow(worksheet, headerRowNumber) : undefined;
    const dataStart = options.hasHeader ? headerRowNumber + 1 : 1;
    let emitted = 0;

    worksheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
      if (rowNumber < dataStart) {
        return;
      }
      if (emitted >= XLSX_MAX_ROWS_PER_SHEET) {
        warnRowLimit({ sheet: sheetName, rowNumber, limit: XLSX_MAX_ROWS_PER_SHEET });
        return;
      }
      emitted += 1;

      const fields = buildRowFields(worksheet, rowNumber, columnNames);
      const fieldValues = createSafeRecord<unknown>();
      for (const [key, value] of Object.entries(fields)) {
        fieldValues[key] = value;
      }
      delete fieldValues.__formulas;

      const uncached = collectUncachedFormulaCells(worksheet, rowNumber, columnNames);
      if (uncached.length > 0) {
        warnUncached({
          sheet: sheetName,
          rowNumber,
          cells: uncached,
        });
      }

      const sourceLocator = `xlsx:${sheetName}!row:${rowNumber}`;

      if (rowIsEmpty(fieldValues)) {
        const rawPayload = createSafeRecord<unknown>();
        rawPayload.sheet = sheetName;
        rawPayload.rowNumber = rowNumber;
        rawPayload.fields = fieldValues;
        rows.push({
          rowNumber,
          sheetName,
          sourceLocator,
          parseStatus: "SKIPPED",
          rawPayload,
          recordHash: sha256SafeCanonicalJson({
            sheet: sheetName,
            rowNumber,
            parseStatus: "SKIPPED",
          }),
        });
        return;
      }

      const rawPayload = createSafeRecord<unknown>();
      rawPayload.sheet = sheetName;
      rawPayload.rowNumber = rowNumber;
      rawPayload.fields = fieldValues;
      if (fields.__formulas && typeof fields.__formulas === "object") {
        rawPayload.formulas = fields.__formulas;
      }

      rows.push({
        rowNumber,
        sheetName,
        sourceLocator,
        parseStatus: "OK",
        rawPayload,
        recordHash: sha256SafeCanonicalJson(rawPayload),
      });
    });
  }

  return { rows, warnings };
}

function countRows(rows: ParsedXlsxRow[]): ImportCounts {
  let parsedOk = 0;
  let skippedEmpty = 0;
  for (const row of rows) {
    if (row.parseStatus === "OK") {
      parsedOk += 1;
    } else if (row.parseStatus === "SKIPPED") {
      skippedEmpty += 1;
    }
  }
  const totalRowsSeen = rows.length;
  const parseErrors = 0;
  assertCountInvariant(totalRowsSeen, parsedOk, parseErrors, skippedEmpty);
  return { totalRowsSeen, parsedOk, parseErrors, skippedEmpty, inserted: rows.length };
}

export class XlsxSourceImporter implements SourceImporterPort {
  readonly kind = "xlsx" as const;

  private readonly client: Sql;
  private readonly artifactStore: FsArtifactStore;
  private ownsClient: boolean;

  constructor(options: XlsxSourceImporterOptions) {
    this.client = options.client ?? createPostgresClient();
    this.artifactStore = options.artifactStore;
    this.ownsClient = options.client === undefined;
  }

  async import(
    request: XlsxImportRequest,
  ): Promise<OperationResult<SourceImportSummary>> {
    const hasHeader = request.hasHeader ?? true;
    let bytes: Uint8Array;
    try {
      const buf = await fs.readFile(request.filePath);
      bytes = new Uint8Array(buf);
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (code === "ENOENT") {
        return fail(
          "ERR_IO_NOT_FOUND",
          "STORAGE",
          `file not found: ${request.filePath}`,
          false,
        );
      }
      if (code === "EACCES" || code === "EPERM") {
        return fail(
          "ERR_IO_PERMISSION",
          "STORAGE",
          `permission denied reading: ${request.filePath}`,
          false,
        );
      }
      return fail(
        "ERR_IO_READ",
        "STORAGE",
        `failed to read file: ${request.filePath}`,
        true,
      );
    }

    if (bytes.length === 0) {
      return fail(
        "ERR_PARSE_EMPTY_OR_BINARY",
        "VALIDATION",
        "XLSX file is empty",
        false,
      );
    }

    try {
      assertXlsxZipNotBomb(bytes);
    } catch {
      return fail(
        "ERR_SEC_ZIP_BOMB",
        "SECURITY",
        "XLSX archive exceeds safe decompression limits",
        false,
      );
    }

    const fileSha256 = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = buildIdempotencyKey(
      request.tenantId,
      request.sourceId,
      fileSha256,
    );

    const existing = await withTenantTransaction(this.client, request.tenantId, async (db) => {
      const batchRows = await db
        .select()
        .from(qumImportBatches)
        .where(
          and(
            eq(qumImportBatches.tenantId, request.tenantId),
            eq(qumImportBatches.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return batchRows[0];
    });

    if (existing?.status === "COMPLETED") {
      const artifactId = await this.resolveArtifactId(
        request.tenantId,
        fileSha256,
        existing.id,
      );
      return ok(
        {
          batchId: existing.id,
          artifactId,
          artifactSha256: fileSha256,
          counts: mapBatchCounts(existing, 0),
          idempotentReplay: true,
        },
        [],
      );
    }

    const originalName =
      request.originalName ?? request.filePath.split(/[/\\]/).pop() ?? "import.xlsx";
    const storeResult = await this.artifactStore.put({
      tenantId: request.tenantId,
      bytes,
      artifactKind: "source_file",
      originalName,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    if (!storeResult.ok) {
      return fail(
        storeResult.error.code,
        storeResult.error.category,
        storeResult.error.message,
        storeResult.error.retryable,
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        NodeBuffer.from(bytes) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0],
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return fail("ERR_PARSE_XLSX", "VALIDATION", message, false);
    }

    const { rows, warnings } = parseXlsxWorkbook(workbook, {
      sheets: request.sheets,
      hasHeader,
    });
    const counts = countRows(rows);

    const batchId = randomUUID();
    const startedAt = new Date();

    const summary = await withTenantTransaction(this.client, request.tenantId, async (db) => {
      const artifactId = await this.ensureArtifactRow(
        db,
        request.tenantId,
        storeResult.data,
        fileSha256,
        originalName,
      );

      await db.insert(qumImportBatches).values({
        id: batchId,
        tenantId: request.tenantId,
        sourceId: request.sourceId,
        schemaVersionId: request.schemaVersionId,
        idempotencyKey,
        status: "RUNNING",
        totalRowsSeen: 0,
        parsedOk: 0,
        parseErrors: 0,
        skippedEmpty: 0,
        startedAt,
      });

      if (rows.length > 0) {
        await db.insert(qumRawRecords).values(
          rows.map((row) => ({
            id: randomUUID(),
            tenantId: request.tenantId,
            batchId,
            artifactId,
            sourceLocator: row.sourceLocator,
            recordHash: row.recordHash,
            rawPayload: toPlainJson(row.rawPayload),
            parseStatus: row.parseStatus,
            parseError: null,
          })),
        );
      }

      const [batch] = await db
        .update(qumImportBatches)
        .set({
          status: "COMPLETED",
          totalRowsSeen: counts.totalRowsSeen,
          parsedOk: counts.parsedOk,
          parseErrors: counts.parseErrors,
          skippedEmpty: counts.skippedEmpty,
          finishedAt: new Date(),
        })
        .where(eq(qumImportBatches.id, batchId))
        .returning();

      if (!batch) {
        throw new Error("failed to finalize import batch");
      }

      return {
        batchId,
        artifactId,
        artifactSha256: fileSha256,
        counts: mapBatchCounts(batch, rows.length),
        idempotentReplay: false,
      };
    });

    return ok(summary, warnings);
  }

  async close(): Promise<void> {
    if (this.ownsClient) {
      await this.client.end({ timeout: 5 });
    }
  }

  private async resolveArtifactId(
    tenantId: string,
    sha256: string,
    batchId: string,
  ): Promise<string> {
    return withTenantTransaction(this.client, tenantId, async (db) => {
      const byBatch = await db
        .select({ artifactId: qumRawRecords.artifactId })
        .from(qumRawRecords)
        .where(eq(qumRawRecords.batchId, batchId))
        .limit(1);
      if (byBatch[0]?.artifactId) {
        return byBatch[0].artifactId;
      }
      const bySha = await db
        .select({ id: qumArtifacts.id })
        .from(qumArtifacts)
        .where(
          and(
            eq(qumArtifacts.tenantId, tenantId),
            eq(qumArtifacts.sha256, sha256),
            eq(qumArtifacts.artifactKind, "source_file"),
          ),
        )
        .limit(1);
      return bySha[0]?.id ?? randomUUID();
    });
  }

  private async ensureArtifactRow(
    db: QuimeraDb,
    tenantId: string,
    evidence: EvidenceArtifact,
    fileSha256: string,
    originalName: string,
  ): Promise<string> {
    const existing = await db
      .select({ id: qumArtifacts.id })
      .from(qumArtifacts)
      .where(
        and(
          eq(qumArtifacts.tenantId, tenantId),
          eq(qumArtifacts.sha256, fileSha256),
          eq(qumArtifacts.artifactKind, "source_file"),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return existing[0].id;
    }

    const id = randomUUID();
    await db.insert(qumArtifacts).values({
      id,
      tenantId,
      sha256: fileSha256,
      artifactKind: "source_file",
      originalName,
      mimeType: evidence.mimeType,
      byteSize: evidence.byteSize,
      storageUri: evidence.storageUri,
      ingestedAt: new Date(evidence.ingestedAt),
    });
    return id;
  }
}