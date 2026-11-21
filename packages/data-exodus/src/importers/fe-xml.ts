import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import {
  parseDocumentXml,
  verifySignedDocumentXml,
  type ParseDocumentResult,
} from "@dojocoding/hacienda-sdk";
import type {
  EvidenceArtifact,
  OperationResult,
  QuimeraError,
  QuimeraWarning,
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
import type {
  ImportCounts,
  SourceImporterPort,
  SourceImportRequest,
  SourceImportSummary,
} from "./types.js";

const XXE_PATTERN = /<!DOCTYPE|<!ENTITY/i;
const FE_V44_NS = /xml-schemas\/v4\.4\//i;
const FE_V43_NS = /xml-schemas\/v4\.3\//i;
const CLAVE_PATTERN = /<Clave>\s*(\d{50})\s*<\/Clave>/i;
const MENSAJE_HACIENDA_ROOT = /<MensajeHacienda\b/i;

export type FeXmlImportRequest = SourceImportRequest & {
  verifySignature?: boolean;
};

export type FeXmlSourceImporterOptions = {
  client?: Sql;
  artifactStore: FsArtifactStore;
};

type ParsedFeRow = {
  sourceLocator: string;
  parseStatus: "OK" | "ERROR";
  parseError?: string;
  rawPayload: Record<string, unknown>;
  recordHash: string;
};

function ok(
  data: SourceImportSummary,
  warnings: QuimeraWarning[] = [],
): OperationResult<SourceImportSummary> {
  return { ok: true, data, warnings };
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

export function assertFeXmlSafeForParsing(xmlText: string): void {
  if (XXE_PATTERN.test(xmlText)) {
    throw Object.assign(new Error("DOCTYPE or ENTITY declarations are not allowed"), {
      code: "ERR_SEC_XXE_REJECTED",
    });
  }
}

function buildIdempotencyKey(
  tenantId: string,
  sourceId: string,
  artifactSha256: string,
): string {
  return sha256CanonicalJson({
    tenantId,
    sourceId,
    artifactSha256,
    kind: "fe_xml",
  });
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

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
  }
  return false;
}

function decodeXmlBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

function detectFeVersion(xml: string): "4.4" | "4.3" | "unknown" {
  if (FE_V44_NS.test(xml)) return "4.4";
  if (FE_V43_NS.test(xml)) return "4.3";
  return "unknown";
}

function extractIdentificacion(party: {
  nombre?: string;
  identificacion?: { tipo?: string; numero?: string };
} | undefined): Record<string, unknown> | null {
  if (!party) return null;
  return {
    nombre: party.nombre ?? null,
    tipoIdentificacion: party.identificacion?.tipo ?? null,
    numeroIdentificacion: party.identificacion?.numero ?? null,
  };
}

function extractLineas(
  detalle:
    | Array<{
        numeroLinea?: number;
        codigoCabys?: string;
        cantidad?: number;
        precioUnitario?: number;
        montoTotal?: number;
        impuesto?: Array<{ codigo?: string; tarifa?: number; monto?: number }>;
      }>
    | undefined,
): Array<Record<string, unknown>> {
  if (!detalle?.length) return [];
  return detalle.map((line) => ({
    numeroLinea: line.numeroLinea ?? null,
    codigoCabys: line.codigoCabys ?? null,
    cantidad: line.cantidad ?? null,
    precioUnitario: line.precioUnitario ?? null,
    montoTotal: line.montoTotal ?? null,
    impuesto: line.impuesto ?? [],
  }));
}

function extractTotales(
  resumen:
    | {
        codigoTipoMoneda?: { codigoMoneda?: string; tipoCambio?: number };
        totalComprobante?: number;
        totalVentaNeta?: number;
        totalImpuesto?: number;
        totalGravado?: number;
        totalExento?: number;
      }
    | undefined,
): Record<string, unknown> | null {
  if (!resumen) return null;
  return {
    codigoMoneda: resumen.codigoTipoMoneda?.codigoMoneda ?? null,
    tipoCambio: resumen.codigoTipoMoneda?.tipoCambio ?? null,
    totalComprobante: resumen.totalComprobante ?? null,
    totalVentaNeta: resumen.totalVentaNeta ?? null,
    totalImpuesto: resumen.totalImpuesto ?? null,
    totalGravado: resumen.totalGravado ?? null,
    totalExento: resumen.totalExento ?? null,
  };
}

function buildParsedPayload(
  parsed: ParseDocumentResult,
  options: { feVersion: string; verifiedSignature: boolean | null },
): Record<string, unknown> {
  const doc = parsed.document;
  const clave = doc.clave;
  return {
    format: "fe_xml",
    feVersion: options.feVersion,
    rootElement: parsed.rootElement,
    clave,
    numeroConsecutivo: doc.numeroConsecutivo ?? null,
    fechaEmision: doc.fechaEmision ?? null,
    emisor: extractIdentificacion(doc.emisor),
    receptor: extractIdentificacion(doc.receptor),
    lineas: extractLineas(doc.detalleServicio),
    totales: extractTotales(doc.resumenFactura),
    verifiedSignature: options.verifiedSignature,
    xpath: `/${parsed.rootElement}/Clave`,
  };
}

function extractLegacyV43Fields(xml: string): {
  clave: string | null;
  emisor: Record<string, unknown> | null;
  receptor: Record<string, unknown> | null;
  totales: Record<string, unknown> | null;
} {
  const claveMatch = CLAVE_PATTERN.exec(xml);
  const clave = claveMatch?.[1] ?? null;

  const emisorNombre = /<Emisor>[\s\S]*?<Nombre>\s*([^<]+)\s*<\/Nombre>/i.exec(xml);
  const emisorTipo = /<Emisor>[\s\S]*?<Tipo>\s*(\d{2})\s*<\/Tipo>/i.exec(xml);
  const emisorNumero = /<Emisor>[\s\S]*?<Numero>\s*(\d{9,12})\s*<\/Numero>/i.exec(xml);

  const receptorNombre = /<Receptor>[\s\S]*?<Nombre>\s*([^<]+)\s*<\/Nombre>/i.exec(xml);
  const receptorTipo = /<Receptor>[\s\S]*?<Tipo>\s*(\d{2})\s*<\/Tipo>/i.exec(xml);
  const receptorNumero = /<Receptor>[\s\S]*?<Numero>\s*(\d{9,12})\s*<\/Numero>/i.exec(xml);

  const totalComprobante = /<TotalComprobante>\s*([\d.]+)\s*<\/TotalComprobante>/i.exec(
    xml,
  );

  return {
    clave,
    emisor: emisorNombre
      ? {
          nombre: emisorNombre[1] ?? null,
          tipoIdentificacion: emisorTipo?.[1] ?? null,
          numeroIdentificacion: emisorNumero?.[1] ?? null,
        }
      : null,
    receptor: receptorNombre
      ? {
          nombre: receptorNombre[1] ?? null,
          tipoIdentificacion: receptorTipo?.[1] ?? null,
          numeroIdentificacion: receptorNumero?.[1] ?? null,
        }
      : null,
    totales: totalComprobante
      ? { totalComprobante: Number(totalComprobante[1]) }
      : null,
  };
}

function buildMensajeHaciendaPayload(xml: string, clave: string): Record<string, unknown> {
  return {
    format: "fe_xml",
    documentKind: "hacienda_response",
    feVersion: detectFeVersion(xml),
    rootElement: "MensajeHacienda",
    clave,
    xpath: "/MensajeHacienda/Clave",
  };
}

async function parseFeXmlDocument(
  xml: string,
  verifySignature: boolean,
): Promise<{ row: ParsedFeRow; warnings: QuimeraWarning[] }> {
  const warnings: QuimeraWarning[] = [];

  if (MENSAJE_HACIENDA_ROOT.test(xml)) {
    const claveMatch = CLAVE_PATTERN.exec(xml);
    const clave = claveMatch?.[1];
    if (!clave) {
      const rawPayload = {
        format: "fe_xml",
        documentKind: "hacienda_response",
        parseHint: "missing_clave",
      };
      return {
        row: {
          sourceLocator: "fe_xml:document:hacienda_response",
          parseStatus: "ERROR",
          parseError: "ERR_XML_INVALID_SCHEMA",
          rawPayload,
          recordHash: sha256CanonicalJson(canonicalizeJsonValue(rawPayload)),
        },
        warnings,
      };
    }
    const rawPayload = buildMensajeHaciendaPayload(xml, clave);
    return {
      row: {
        sourceLocator: `fe_xml:clave:${clave}`,
        parseStatus: "OK",
        rawPayload,
        recordHash: sha256CanonicalJson(canonicalizeJsonValue(rawPayload)),
      },
      warnings,
    };
  }

  const feVersion = detectFeVersion(xml);

  if (feVersion === "4.3") {
    const legacy = extractLegacyV43Fields(xml);
    warnings.push({
      code: "WARN_XML_LEGACY_V43",
      message: "Legacy FE 4.3 namespace detected; fields extracted without full SDK parse",
      context: { feVersion: "4.3" },
    });
    if (!legacy.clave) {
      const rawPayload = {
        format: "fe_xml",
        feVersion: "4.3",
        legacy: true,
      };
      return {
        row: {
          sourceLocator: "fe_xml:document:legacy_v43",
          parseStatus: "ERROR",
          parseError: "ERR_XML_INVALID_SCHEMA",
          rawPayload,
          recordHash: sha256CanonicalJson(canonicalizeJsonValue(rawPayload)),
        },
        warnings,
      };
    }
    const rawPayload = {
      format: "fe_xml",
      feVersion: "4.3",
      legacy: true,
      clave: legacy.clave,
      emisor: legacy.emisor,
      receptor: legacy.receptor,
      totales: legacy.totales,
      xpath: "/FacturaElectronica/Clave",
    };
    return {
      row: {
        sourceLocator: `fe_xml:clave:${legacy.clave}`,
        parseStatus: "OK",
        rawPayload,
        recordHash: sha256CanonicalJson(canonicalizeJsonValue(rawPayload)),
      },
      warnings,
    };
  }

  let verifiedSignature: boolean | null = null;
  if (verifySignature) {
    const verification = await verifySignedDocumentXml(xml);
    verifiedSignature = verification.valid;
  }

  try {
    const parsed = parseDocumentXml(xml);
    const clave = parsed.document.clave;
    const rawPayload = buildParsedPayload(parsed, {
      feVersion: feVersion === "4.4" ? "4.4" : "unknown",
      verifiedSignature,
    });
    return {
      row: {
        sourceLocator: `fe_xml:clave:${clave}`,
        parseStatus: "OK",
        rawPayload,
        recordHash: sha256CanonicalJson(canonicalizeJsonValue(rawPayload)),
      },
      warnings,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const rawPayload = {
      format: "fe_xml",
      feVersion,
      parseFailure: message,
    };
    return {
      row: {
        sourceLocator: "fe_xml:document:parse_error",
        parseStatus: "ERROR",
        parseError: "ERR_XML_INVALID_SCHEMA",
        rawPayload,
        recordHash: sha256CanonicalJson(canonicalizeJsonValue(rawPayload)),
      },
      warnings,
    };
  }
}

export class FeXmlSourceImporter implements SourceImporterPort {
  readonly kind = "fe_xml" as const;

  private readonly client: Sql;
  private readonly artifactStore: FsArtifactStore;
  private ownsClient: boolean;

  constructor(options: FeXmlSourceImporterOptions) {
    this.client = options.client ?? createPostgresClient();
    this.artifactStore = options.artifactStore;
    this.ownsClient = options.client === undefined;
  }

  async import(
    request: FeXmlImportRequest,
  ): Promise<OperationResult<SourceImportSummary>> {
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
        "XML file is empty or appears to be binary",
        false,
      );
    }

    const xmlText = decodeXmlBytes(bytes);
    if (xmlText.trim().length === 0) {
      return fail(
        "ERR_PARSE_EMPTY_OR_BINARY",
        "VALIDATION",
        "XML file contains no textual content",
        false,
      );
    }

    try {
      assertFeXmlSafeForParsing(xmlText);
    } catch {
      return fail(
        "ERR_SEC_XXE_REJECTED",
        "SECURITY",
        "XML contains DOCTYPE or ENTITY declarations and was rejected",
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
      request.originalName ?? request.filePath.split(/[/\\]/).pop() ?? "import.xml";
    const storeResult = await this.artifactStore.put({
      tenantId: request.tenantId,
      bytes,
      artifactKind: "source_file",
      originalName,
      mimeType: "application/xml",
    });
    if (!storeResult.ok) {
      return fail(
        storeResult.error.code,
        storeResult.error.category,
        storeResult.error.message,
        storeResult.error.retryable,
      );
    }

    const { row, warnings } = await parseFeXmlDocument(
      xmlText,
      request.verifySignature === true,
    );

    const parsedOk = row.parseStatus === "OK" ? 1 : 0;
    const parseErrors = row.parseStatus === "ERROR" ? 1 : 0;
    const counts = {
      totalRowsSeen: 1,
      parsedOk,
      parseErrors,
      skippedEmpty: 0,
    };

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

      await db.insert(qumRawRecords).values({
        id: randomUUID(),
        tenantId: request.tenantId,
        batchId,
        artifactId,
        sourceLocator: row.sourceLocator,
        recordHash: row.recordHash,
        rawPayload: row.rawPayload,
        parseStatus: row.parseStatus,
        parseError: row.parseError ?? null,
      });

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
        counts: mapBatchCounts(batch, 1),
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