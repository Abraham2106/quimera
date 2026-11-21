import { createHash, randomUUID } from "node:crypto";

import type {
  ArtifactKind,
  ArtifactStorePort,
  ArtifactStorePutInput,
  EvidenceArtifact,
  OperationResult,
  QuimeraError,
} from "@quimera/core";

import { isPathTraversalOriginalName, pathTraversalError, quimeraError } from "./path-guards.js";

export const FISCAL_RETENTION_DAYS = 1825;

const SHA256_HEX = /^[a-f0-9]{64}$/;
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "text/csv",
  "text/plain",
  "text/xml",
  "application/xml",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const RETAINED_KINDS = new Set<ArtifactKind>([
  "source_file",
  "fe_xml_unsigned",
  "fe_xml_signed",
  "hacienda_response",
  "reconciliation_report",
]);

export type StoredObject = {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly retainUntil: string | null;
  readonly contentType: string;
};

export type ObjectLockClient = {
  put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    retainUntil: string | null;
  }): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string, now: Date): Promise<"deleted" | "retained" | "missing">;
};

export type ArtifactQuarantine = {
  inspect(input: ArtifactStorePutInput): Promise<OperationResult<void>>;
};

function ok<T>(data: T): OperationResult<T> {
  return { ok: true, data, warnings: [] };
}

function fail(error: QuimeraError): OperationResult<never> {
  return { ok: false, error, warnings: [] };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function objectKey(tenantId: string, sha256: string): string {
  return `tenants/${tenantId}/sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;
}

export function storageUriFor(tenantId: string, sha256: string): string {
  return `s3://${objectKey(tenantId, sha256)}`;
}

function parseStorageUri(storageUri: string): { tenantId: string; sha256: string } | null {
  const match =
    /^s3:\/\/tenants\/([0-9a-f-]{36})\/sha256\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{64})$/i.exec(
      storageUri,
    );
  if (!match) {
    return null;
  }
  const sha256 = match[4]!.toLowerCase();
  if (sha256.slice(0, 2) !== match[2]!.toLowerCase() || sha256.slice(2, 4) !== match[3]!.toLowerCase()) {
    return null;
  }
  return { tenantId: match[1]!.toLowerCase(), sha256 };
}

function retentionUntil(kind: ArtifactKind, now: Date): string | null {
  if (!RETAINED_KINDS.has(kind)) {
    return null;
  }
  const until = new Date(now.getTime());
  until.setUTCDate(until.getUTCDate() + FISCAL_RETENTION_DAYS);
  return until.toISOString();
}

export class MemoryObjectLockClient implements ObjectLockClient {
  private readonly objects = new Map<string, StoredObject>();

  async put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    retainUntil: string | null;
  }): Promise<void> {
    this.objects.set(input.key, {
      bytes: input.bytes,
      sha256: sha256Hex(input.bytes),
      retainUntil: input.retainUntil,
      contentType: input.contentType,
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string, now: Date): Promise<"deleted" | "retained" | "missing"> {
    const current = this.objects.get(key);
    if (!current) {
      return "missing";
    }
    if (current.retainUntil && new Date(current.retainUntil).getTime() > now.getTime()) {
      return "retained";
    }
    this.objects.delete(key);
    return "deleted";
  }

  /** Test-only: corrupts stored bytes without updating the recorded digest. */
  corrupt(key: string): void {
    const current = this.objects.get(key);
    if (!current || current.bytes.length === 0) {
      return;
    }
    const bytes = new Uint8Array(current.bytes);
    bytes[0] = bytes[0]! ^ 0xff;
    this.objects.set(key, { ...current, bytes });
  }
}

export class S3ArtifactStore implements ArtifactStorePort {
  constructor(
    private readonly objects: ObjectLockClient,
    private readonly options: { quarantine?: ArtifactQuarantine; now?: () => Date } = {},
  ) {}

  async put(input: ArtifactStorePutInput): Promise<OperationResult<EvidenceArtifact>> {
    if (isPathTraversalOriginalName(input.originalName)) {
      return fail(pathTraversalError(`rejected originalName: ${input.originalName}`));
    }
    if (!ALLOWED_MIME.has(input.mimeType)) {
      return fail(
        quimeraError("ERR_ARTIFACT_STORE", "VALIDATION", `mime no permitido: ${input.mimeType}`, false),
      );
    }
    if (input.bytes.byteLength > MAX_ARTIFACT_BYTES) {
      return fail(
        quimeraError("ERR_ARTIFACT_STORE", "VALIDATION", "el artefacto supera 50 MiB", false),
      );
    }
    if (this.options.quarantine) {
      const inspected = await this.options.quarantine.inspect(input);
      if (!inspected.ok) {
        return inspected;
      }
    }

    const now = this.options.now?.() ?? new Date();
    const sha256 = sha256Hex(input.bytes);
    const key = objectKey(input.tenantId, sha256);
    const existing = await this.objects.get(key);
    if (existing && existing.sha256 !== sha256) {
      return fail(
        quimeraError(
          "ERR_ARTIFACT_INTEGRITY_FAILED",
          "SECURITY",
          `objeto existente no coincide con ${sha256}`,
          false,
        ),
      );
    }
    if (!existing) {
      await this.objects.put({
        key,
        bytes: input.bytes,
        contentType: input.mimeType,
        retainUntil: retentionUntil(input.artifactKind, now),
      });
    }

    return ok({
      id: randomUUID(),
      tenantId: input.tenantId,
      sha256,
      artifactKind: input.artifactKind,
      originalName: input.originalName,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      storageUri: storageUriFor(input.tenantId, sha256),
      ingestedAt: now.toISOString(),
    });
  }

  async get(storageUri: string): Promise<OperationResult<Uint8Array>> {
    const parsed = parseStorageUri(storageUri);
    if (!parsed || !SHA256_HEX.test(parsed.sha256)) {
      return fail(pathTraversalError(`storageUri inválida: ${storageUri}`));
    }
    const stored = await this.objects.get(objectKey(parsed.tenantId, parsed.sha256));
    if (!stored) {
      return fail(quimeraError("ERR_ARTIFACT_STORE", "STORAGE", `artifact not found: ${storageUri}`, false));
    }
    const digest = sha256Hex(stored.bytes);
    if (digest !== parsed.sha256 || digest !== stored.sha256) {
      return fail(
        quimeraError(
          "ERR_ARTIFACT_INTEGRITY_FAILED",
          "SECURITY",
          `sha256 mismatch for ${storageUri}`,
          false,
        ),
      );
    }
    return ok(stored.bytes);
  }

  async existsBySha256(tenantId: string, sha256: string): Promise<boolean> {
    if (!SHA256_HEX.test(sha256)) {
      return false;
    }
    const stored = await this.objects.get(objectKey(tenantId, sha256));
    return stored !== null && stored.sha256 === sha256;
  }

  async delete(storageUri: string, now = new Date()): Promise<OperationResult<void>> {
    const parsed = parseStorageUri(storageUri);
    if (!parsed) {
      return fail(pathTraversalError(`storageUri inválida: ${storageUri}`));
    }
    const outcome = await this.objects.delete(objectKey(parsed.tenantId, parsed.sha256), now);
    if (outcome === "retained") {
      return fail(
        quimeraError(
          "ERR_ARTIFACT_STORE",
          "SECURITY",
          "retención fiscal vigente: el artefacto no se puede borrar antes de 1825 días",
          false,
        ),
      );
    }
    if (outcome === "missing") {
      return fail(quimeraError("ERR_ARTIFACT_STORE", "STORAGE", `artifact not found: ${storageUri}`, false));
    }
    return ok(undefined);
  }
}
