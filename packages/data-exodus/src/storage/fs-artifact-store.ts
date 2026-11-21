import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
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

function ok<T>(data: T): OperationResult<T> {
  return { ok: true, data, warnings: [] };
}

function fail(error: QuimeraError): OperationResult<never> {
  return { ok: false, error, warnings: [] };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function buildStorageUri(sha256: string): string {
  const prefix = sha256.slice(0, 2);
  return `cas://sha256/${prefix}/${sha256}`;
}

export class FsArtifactStore implements ArtifactStorePort {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
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

    const sha256 = sha256Hex(input.bytes);
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
      const writeResult = await this.writeAtomic(filePath, input.bytes);
      if (!writeResult.ok) {
        return writeResult;
      }
    } else {
      const integrity = await this.verifyFileIntegrity(filePath, sha256);
      if (!integrity.ok) {
        return fail(integrity.error);
      }
    }

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
      const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
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
      return fail(
        quimeraError(
          "ERR_ARTIFACT_STORE",
          "STORAGE",
          `failed to read artifact: ${storageUri}`,
          true,
        ),
      );
    }

    const digest = sha256Hex(bytes);
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

  async existsBySha256(_tenantId: string, sha256: string): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
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
      const buf = await fs.readFile(filePath);
      const digest = sha256Hex(new Uint8Array(buf));
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
    } catch {
      return fail(
        quimeraError(
          "ERR_ARTIFACT_STORE",
          "STORAGE",
          `failed to verify existing CAS object at ${filePath}`,
          true,
        ),
      );
    }
  }

  private async writeAtomic(
    filePath: string,
    bytes: Uint8Array,
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
    } catch {
      await fs.rm(tempPath, { force: true });
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