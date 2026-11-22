import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import type {
  EvidenceArtifact,
  OperationResult,
  QuimeraError,
} from "@quimera/core";
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
import { looksBinary } from "./csv-decode.js";
import { assertCountInvariant } from "./csv-parse-rows.js";
import {
  assertSafeObjectKey,
  canonicalizeSafeJsonValue,
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

export type ParsedJsonRow = {
  index: number;
  sourceLocator: string;
  parseStatus: "OK" | "ERROR" | "SKIPPED";
  parseError?: string;
  rawPayload: Record<string, unknown>;
  recordHash: string;
};

export type JsonRowCounts = {
  totalRowsSeen: number;
  parsedOk: number;
  parseErrors: number;
  skippedEmpty: number;
};

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
): string {
  return sha256SafeCanonicalJson({ tenantId, sourceId, artifactSha256, kind: "json" });
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

export function parseJsonRows(elements: unknown[]): { rows: ParsedJsonRow[]; counts: JsonRowCounts } {
  const rows: ParsedJsonRow[] = [];
  let parsedOk = 0;
  let parseErrors = 0;
  let skippedEmpty = 0;

  for (let i = 0; i < elements.length; i += 1) {
    const index = i + 1;
    const element = elements[i];

    if (element === null || element === undefined) {
      const rawPayload = createSafeRecord<unknown>();
      rawPayload.index = index;
      rawPayload.kind = "json";
      rawPayload.fields = createSafeRecord();
      rows.push({
        index,
        sourceLocator: `json:index:${index}`,
        parseStatus: "SKIPPED",
        rawPayload,
        recordHash: sha256SafeCanonicalJson({
          index,
          parseStatus: "SKIPPED",
        }),
      });
      skippedEmpty += 1;
      continue;
    }

    if (typeof element !== "object" || Array.isArray(element)) {
      const message = "JSON array element must be a plain object";
      const rawPayload = createSafeRecord<unknown>();
      rawPayload.index = index;
      rawPayload.kind = "json";
      rawPayload.fields = createSafeRecord();
      rawPayload.parseError = message;
      rawPayload.rawValue = canonicalizeSafeJsonValue(element);
      rows.push({
        index,
        sourceLocator: `json:index:${index}`,
        parseStatus: "ERROR",
        parseError: message,
        rawPayload,
        recordHash: sha256SafeCanonicalJson({
          index,
          parseStatus: "ERROR",
          rawValue: canonicalizeSafeJsonValue(element),
        }),
      });
      parseErrors += 1;
      continue;
    }

    try {
      const fields = jsonObjectToFields(element as Record<string, unknown>);
      const rawPayload = createSafeRecord<unknown>();
      rawPayload.index = index;
      rawPayload.kind = "json";
      rawPayload.fields = fields;
      rows.push({
        index,
        sourceLocator: `json:index:${index}`,
        parseStatus: "OK",
        rawPayload,
        recordHash: sha256SafeCanonicalJson(rawPayload),
      });
      parsedOk += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const rawPayload = createSafeRecord<unknown>();
      rawPayload.index = index;
      rawPayload.kind = "json";
      rawPayload.fields = createSafeRecord();
      rawPayload.parseError = message;
      rows.push({
        index,
        sourceLocator: `json:index:${index}`,
        parseStatus: "ERROR",
        parseError: message,
        rawPayload,
        recordHash: sha256SafeCanonicalJson({
          index,
          parseStatus: "ERROR",
          parseError: message,
        }),
      });
      parseErrors += 1;
    }
  }

  const totalRowsSeen = rows.length;
  assertCountInvariant(totalRowsSeen, parsedOk, parseErrors, skippedEmpty);

  return {
    rows,
    counts: { totalRowsSeen, parsedOk, parseErrors, skippedEmpty },
  };
}

function jsonObjectToFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields = createSafeRecord<unknown>();
  for (const [key, value] of Object.entries(obj)) {
    assertSafeObjectKey(key);
    fields[key] = jsonFieldValue(value);
  }
  return fields;
}

function jsonFieldValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    return canonicalizeSafeJsonValue(value);
  }
  return value;
}

export type JsonSourceImporterOptions = {
  client?: Sql;
  artifactStore: FsArtifactStore;
};

export class JsonSourceImporter implements SourceImporterPort {
  readonly kind = "json" as const;

  private readonly client: Sql;
  private readonly artifactStore: FsArtifactStore;
  private ownsClient: boolean;

  constructor(options: JsonSourceImporterOptions) {
    this.client = options.client ?? createPostgresClient();
    this.artifactStore = options.artifactStore;
    this.ownsClient = options.client === undefined;
  }

  async import(request: SourceImportRequest): Promise<OperationResult<SourceImportSummary>> {
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

    if (bytes.length === 0 || looksBinary(bytes)) {
      return fail(
        "ERR_PARSE_EMPTY_OR_BINARY",
        "VALIDATION",
        "JSON file is empty or appears to be binary",
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
      request.originalName ?? request.filePath.split(/[/\\]/).pop() ?? "import.json";
    const storeResult = await this.artifactStore.put({
      tenantId: request.tenantId,
      bytes,
      artifactKind: "source_file",
      originalName,
      mimeType: "application/json",
    });
    if (!storeResult.ok) {
      return fail(
        storeResult.error.code,
        storeResult.error.category,
        storeResult.error.message,
        storeResult.error.retryable,
      );
    }

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return fail(
        "ERR_PARSE_JSON",
        "VALIDATION",
        "JSON file is not valid UTF-8",
        false,
      );
    }

    if (text.trim().length === 0) {
      return fail(
        "ERR_PARSE_EMPTY_OR_BINARY",
        "VALIDATION",
        "JSON file contains no textual content",
        false,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return fail("ERR_PARSE_JSON", "VALIDATION", `invalid JSON: ${message}`, false);
    }

    if (!Array.isArray(parsed)) {
      return fail(
        "ERR_PARSE_JSON_NOT_ARRAY",
        "VALIDATION",
        "JSON root must be an array of objects",
        false,
      );
    }

    const { rows, counts } = parseJsonRows(parsed);

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
            parseError: row.parseError ?? null,
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