import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { and, eq } from "drizzle-orm";
import type {
  EvidenceArtifact,
  OperationResult,
  QuimeraError,
} from "@quimera/core";
import { canonicalizeJsonValue, sha256CanonicalJson } from "@quimera/core";
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
import type {
  ImportCounts,
  SourceImporterPort,
  SourceImportRequest,
  SourceImportSummary,
} from "./types.js";

export type SqliteImportRequest = SourceImportRequest & {
  table: string;
};

export type ParsedSqliteRow = {
  rowNumber: number;
  sourceLocator: string;
  parseStatus: "OK";
  rawPayload: Record<string, unknown>;
  recordHash: string;
};

export type SqliteRowCounts = {
  totalRowsSeen: number;
  parsedOk: number;
  parseErrors: number;
  skippedEmpty: number;
};

const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ok(data: SourceImportSummary): OperationResult<SourceImportSummary> {
  return { ok: true, data, warnings: [] };
}

function fail(
  code: string,
  category: QuimeraError["category"],
  message: string,
  retryable: boolean,
): OperationResult<never> {
  return {
    ok: false,
    error: quimeraError(code, category, message, retryable),
    warnings: [],
  };
}

function buildIdempotencyKey(
  tenantId: string,
  sourceId: string,
  artifactSha256: string,
  table: string,
): string {
  return sha256CanonicalJson({ tenantId, sourceId, artifactSha256, kind: "sqlite", table });
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

function assertSafeTableName(table: string): string | null {
  if (!TABLE_NAME_PATTERN.test(table)) {
    return `invalid SQLite table name: ${table}`;
  }
  return null;
}

function sqliteCellValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object" && value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  return value;
}

export function parseSqliteResultRows(
  table: string,
  resultRows: Record<string, unknown>[],
): { rows: ParsedSqliteRow[]; counts: SqliteRowCounts } {
  const rows: ParsedSqliteRow[] = [];
  for (let i = 0; i < resultRows.length; i += 1) {
    const rowNumber = i + 1;
    const sourceRow = resultRows[i]!;
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sourceRow)) {
      fields[key] = sqliteCellValue(value);
    }
    const rawPayload: Record<string, unknown> = {
      rowNumber,
      table,
      kind: "sqlite",
      fields,
    };
    rows.push({
      rowNumber,
      sourceLocator: `sqlite:${table}:row:${rowNumber}`,
      parseStatus: "OK",
      rawPayload,
      recordHash: sha256CanonicalJson(canonicalizeJsonValue(rawPayload)),
    });
  }

  const parsedOk = rows.length;
  const counts: SqliteRowCounts = {
    totalRowsSeen: parsedOk,
    parsedOk,
    parseErrors: 0,
    skippedEmpty: 0,
  };
  assertCountInvariant(
    counts.totalRowsSeen,
    counts.parsedOk,
    counts.parseErrors,
    counts.skippedEmpty,
  );
  return { rows, counts };
}

export type SqliteSourceImporterOptions = {
  client?: Sql;
  artifactStore: FsArtifactStore;
};

export class SqliteSourceImporter implements SourceImporterPort {
  readonly kind = "sqlite" as const;

  private readonly client: Sql;
  private readonly artifactStore: FsArtifactStore;
  private ownsClient: boolean;

  constructor(options: SqliteSourceImporterOptions) {
    this.client = options.client ?? createPostgresClient();
    this.artifactStore = options.artifactStore;
    this.ownsClient = options.client === undefined;
  }

  async import(request: SqliteImportRequest): Promise<OperationResult<SourceImportSummary>> {
    const tableError = assertSafeTableName(request.table);
    if (tableError) {
      return fail("ERR_SQLITE_TABLE_NAME", "VALIDATION", tableError, false);
    }

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
        "SQLite file is empty",
        false,
      );
    }

    const fileSha256 = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = buildIdempotencyKey(
      request.tenantId,
      request.sourceId,
      fileSha256,
      request.table,
    );

    const existing = await withTenantTransaction(this.client, request.tenantId, async (db) => {
      const rows = await db
        .select()
        .from(qumImportBatches)
        .where(
          and(
            eq(qumImportBatches.tenantId, request.tenantId),
            eq(qumImportBatches.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return rows[0];
    });

    if (existing?.status === "COMPLETED") {
      const artifactId = await this.resolveArtifactId(
        request.tenantId,
        fileSha256,
        existing.id,
      );
      return ok({
        batchId: existing.id,
        artifactId,
        artifactSha256: fileSha256,
        counts: mapBatchCounts(existing, 0),
        idempotentReplay: true,
      });
    }

    const originalName =
      request.originalName ?? request.filePath.split(/[/\\]/).pop() ?? "import.sqlite";
    const storeResult = await this.artifactStore.put({
      tenantId: request.tenantId,
      bytes,
      artifactKind: "source_file",
      originalName,
      mimeType: "application/x-sqlite3",
    });
    if (!storeResult.ok) {
      return fail(
        storeResult.error.code,
        storeResult.error.category,
        storeResult.error.message,
        storeResult.error.retryable,
      );
    }

    let sqliteRows: Record<string, unknown>[];
    try {
      sqliteRows = this.readTableRows(request.filePath, request.table);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("no such table")) {
        return fail(
          "ERR_SQLITE_NO_TABLE",
          "VALIDATION",
          `table not found: ${request.table}`,
          false,
        );
      }
      return fail("ERR_SQLITE_OPEN", "STORAGE", message, false);
    }

    const { rows, counts } = parseSqliteResultRows(request.table, sqliteRows);

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
            rawPayload: row.rawPayload,
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

    return ok(summary);
  }

  private readTableRows(filePath: string, table: string): Record<string, unknown>[] {
    const db = new DatabaseSync(filePath, { open: true, readOnly: true });
    try {
      const quoted = `"${table.replaceAll('"', '""')}"`;
      const stmt = db.prepare(`SELECT * FROM ${quoted}`);
      return stmt.all() as Record<string, unknown>[];
    } finally {
      db.close();
    }
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