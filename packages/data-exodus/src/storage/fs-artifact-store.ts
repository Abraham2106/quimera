import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type {
  ArtifactStorePort,
  ArtifactStorePutInput,
  EvidenceArtifact,
  OperationResult,
  QuimeraError,
} from "@quimera/core";
import {
  assertContainedPath,
  isPathTraversalOriginalName,
  parseCasStorageUri,
  pathTraversalError,
  quimeraError,
  resolveCasFilePath,
} from "./path-guards.js";

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
  "application/x-sqlite3",
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function ok<T>(data: T): OperationResult<T> {
  return { ok: true, data, warnings: [] };
}

function fail(error: QuimeraError): OperationResult<never> {
  return { ok: false, error, warnings: [] };
}

function errorCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String(err.code) : "";
}

/** Hash en streaming: nunca exige cargar el objeto completo en memoria. */
async function sha256Readable(readable: AsyncIterable<Uint8Array>): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of readable) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function sha256Bytes(bytes: Uint8Array): Promise<string> {
  return sha256Readable(Readable.from([bytes]));
}

function sha256File(filePath: string): Promise<string> {
  return sha256Readable(createReadStream(filePath) as AsyncIterable<Uint8Array>);
}

function buildStorageUri(sha256: string): string {
  const prefix = sha256.slice(0, 2);
  return `cas://sha256/${prefix}/${sha256}`;
}

export class FsArtifactStore implements ArtifactStorePort {
  private readonly rootDir: string;
  private readonly tenantIndexDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.tenantIndexDir = path.join(this.rootDir, "_tenants");
  }

  async put(
    input: ArtifactStorePutInput,
  ): Promise<OperationResult<EvidenceArtifact>> {
    if (isPathTraversalOriginalName(input.originalName)) {
      return fail(
        pathTraversalError(
          `rejected originalName for path traversal: ${input.originalName}`,
        ),
      );
    }
    if (!ALLOWED_MIME.has(input.mimeType)) {
      return fail(
        quimeraError(
          "ERR_ARTIFACT_STORE",
          "VALIDATION",
          `mime no permitido: ${input.mimeType}`,
          false,
        ),
      );
    }
    if (input.bytes.byteLength > MAX_ARTIFACT_BYTES) {
      return fail(
        quimeraError(
          "ERR_ARTIFACT_STORE",
          "VALIDATION",
          `el artefacto supera ${MAX_ARTIFACT_BYTES} bytes`,
          false,
        ),
      );
    }

    const sha256 = await sha256Bytes(input.bytes);
    let filePath: string;
    try {
      filePath = resolveCasFilePath(this.rootDir, sha256);
    } catch {
      return fail(
        pathTraversalError("invalid content hash path for CAS root"),
      );
    }

    const storageUri = buildStorageUri(sha256);
    const exists = await this.pathExists(filePath);

    if (!exists) {
      const writeResult = await this.writeAtomic(filePath, input.bytes, sha256);
      if (!writeResult.ok) {
        return writeResult;
      }
    } else {
      const integrity = await this.verifyFileIntegrity(filePath, sha256);
      if (!integrity.ok) {
        return fail(integrity.error);
      }
    }
    await this.recordTenant(sha256, input.tenantId);

    const artifact: EvidenceArtifact = {
      id: randomUUID(),
      tenantId: input.tenantId,
      sha256,
      artifactKind: input.artifactKind,
      originalName: input.originalName,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      storageUri,
      ingestedAt: new Date().toISOString(),
    };

    return ok(artifact);
  }

  async get(storageUri: string): Promise<OperationResult<Uint8Array>> {
    const parsed = parseCasStorageUri(storageUri);
    if (!parsed) {
      return fail(
        pathTraversalError(`invalid or unsafe storageUri: ${storageUri}`),
      );
    }

    let filePath: string;
    try {
      filePath = resolveCasFilePath(this.rootDir, parsed.sha256);
    } catch {
      return fail(
        pathTraversalError(`storageUri resolves outside CAS root: ${storageUri}`),
      );
    }

    let bytes: Uint8Array;
    try {
      const buf = await fs.readFile(filePath);
      bytes = new Uint8Array(buf);
    } catch (err: unknown) {
      const code = errorCode(err);
      if (code === "ENOENT") {
        return fail(
          quimeraError(
            "ERR_ARTIFACT_STORE",
            "STORAGE",
            `artifact not found: ${storageUri}`,
            false,
          ),
        );
      }
      if (code === "EPERM" || code === "EACCES") {
        return fail(
          quimeraError(
            "ERR_ARTIFACT_STORE",
            "STORAGE",
            `permission denied reading artifact: ${storageUri}`,
            false,
          ),
        );
      }
      return fail(
        quimeraError(
          "ERR_ARTIFACT_STORE",
          "STORAGE",
          `failed to read artifact: ${storageUri}`,
          true,
        ),
      );
    }

    const digest = await sha256Bytes(bytes);
    if (digest !== parsed.sha256) {
      return fail(
        quimeraError(
          "ERR_ARTIFACT_INTEGRITY_FAILED",
          "SECURITY",
          `sha256 mismatch for ${storageUri}: expected ${parsed.sha256}, got ${digest}`,
          false,
        ),
      );
    }

    return ok(bytes);
  }

  async existsBySha256(tenantId: string, sha256: string): Promise<boolean> {
    if (!SHA256_HEX.test(sha256)) {
      return false;
    }
    // El CAS es global por contenido, pero la pertenencia es por tenant.
    const tenants = await this.tenantsFor(sha256);
    if (!tenants.has(tenantId)) {
      return false;
    }
    let filePath: string;
    try {
      filePath = resolveCasFilePath(this.rootDir, sha256);
    } catch {
      return false;
    }
    return this.pathExists(filePath);
  }

  private async tenantsFor(sha256: string): Promise<Set<string>> {
    try {
      const text = await fs.readFile(path.join(this.tenantIndexDir, sha256), "utf8");
      return new Set(text.split("\n").map((s) => s.trim()).filter((s) => s.length > 0));
    } catch {
      return new Set();
    }
  }

  private async recordTenant(sha256: string, tenantId: string): Promise<void> {
    try {
      await fs.mkdir(this.tenantIndexDir, { recursive: true });
      const indexPath = path.join(this.tenantIndexDir, sha256);
      let current = "";
      try {
        current = await fs.readFile(indexPath, "utf8");
      } catch {
        // primer tenant de este objeto
      }
      if (current.split("\n").includes(tenantId)) {
        return;
      }
      await fs.appendFile(indexPath, `${tenantId}\n`, "utf8");
    } catch {
      // índice best-effort: no debe impedir el put del artefacto
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async verifyFileIntegrity(
    filePath: string,
    expectedSha256: string,
  ): Promise<OperationResult<void>> {
    try {
      const digest = await sha256File(filePath);
      if (digest !== expectedSha256) {
        return fail(
          quimeraError(
            "ERR_ARTIFACT_INTEGRITY_FAILED",
            "SECURITY",
            `existing CAS object corrupt at ${filePath}`,
            false,
          ),
        );
      }
      return ok(undefined);
    } catch (err: unknown) {
      const code = errorCode(err);
      return fail(
        quimeraError(
          "ERR_ARTIFACT_STORE",
          "STORAGE",
          code === "EPERM" || code === "EACCES"
            ? `permission denied verifying CAS object at ${filePath}`
            : `failed to verify existing CAS object at ${filePath}`,
          code === "EPERM" || code === "EACCES" ? false : true,
        ),
      );
    }
  }

  private async writeAtomic(
    filePath: string,
    bytes: Uint8Array,
    expectedSha256: string,
  ): Promise<OperationResult<void>> {
    const dir = path.dirname(filePath);
    try {
      assertContainedPath(this.rootDir, dir);
      await fs.mkdir(dir, { recursive: true });
    } catch {
      return fail(
        pathTraversalError("refusing to create directories outside CAS root"),
      );
    }

    const tempPath = path.join(dir, `.cas-${randomUUID()}.tmp`);
    try {
      assertContainedPath(this.rootDir, tempPath);
      await fs.writeFile(tempPath, bytes);
      await fs.chmod(tempPath, 0o444);
      await fs.rename(tempPath, filePath);
      await fs.chmod(filePath, 0o444);
      return ok(undefined);
    } catch (err: unknown) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      const code = errorCode(err);
      if (code === "EEXIST") {
        // Otro escritor ganó la carrera: si el objeto es íntegro, es idempotente.
        return this.verifyFileIntegrity(filePath, expectedSha256);
      }
      if (code === "EPERM" || code === "EACCES") {
        return fail(
          quimeraError(
            "ERR_ARTIFACT_STORE",
            "STORAGE",
            `permission denied writing CAS object at ${filePath}`,
            false,
          ),
        );
      }
      return fail(
        quimeraError(
          "ERR_ARTIFACT_STORE",
          "STORAGE",
          `atomic CAS write failed for ${filePath}`,
          true,
        ),
      );
    }
  }
}
