import { createHash } from "node:crypto";
import type { EvidenceArtifact } from "../schemas/artifacts.js";
import type { OperationResult } from "../schemas/operations.js";
import type {
  ArtifactStorePort,
  ArtifactStorePutInput,
} from "./artifact-store.js";
import type { ClockPort } from "./clock.js";
import type { LoggerPort, LogEntry } from "./logger.js";

function ok<T>(data: T): OperationResult<T> {
  return { ok: true, data, warnings: [] };
}

function storeErr(message: string): OperationResult<never> {
  return {
    ok: false,
    error: {
      code: "ERR_ARTIFACT_STORE",
      category: "STORAGE",
      message,
      retryable: false,
      correlationId: "00000000-0000-4000-8000-000000000000",
      module: "@quimera/core",
    },
    warnings: [],
  };
}

export class InMemoryArtifactStore implements ArtifactStorePort {
  private readonly byUri = new Map<string, Uint8Array>();
  private readonly bySha = new Map<string, EvidenceArtifact>();
  private seq = 0;

  async put(input: ArtifactStorePutInput): Promise<OperationResult<EvidenceArtifact>> {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const key = `${input.tenantId}:${sha256}`;
    const existing = this.bySha.get(key);
    if (existing) {
      return ok(existing);
    }
  this.seq += 1;
    const id = `00000000-0000-4000-8000-${this.seq.toString(16).padStart(12, "0")}`;
    const prefix = sha256.slice(0, 2);
    const storageUri = `cas://sha256/${prefix}/${sha256}`;
    const artifact: EvidenceArtifact = {
      id,
      tenantId: input.tenantId,
      sha256,
      artifactKind: input.artifactKind,
      originalName: input.originalName,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      storageUri,
      ingestedAt: new Date().toISOString(),
    };
    this.byUri.set(storageUri, input.bytes);
    this.bySha.set(key, artifact);
    return ok(artifact);
  }

  async get(storageUri: string): Promise<OperationResult<Uint8Array>> {
    const bytes = this.byUri.get(storageUri);
    if (!bytes) {
      return storeErr(`artifact not found: ${storageUri}`);
    }
    return ok(bytes);
  }

  async existsBySha256(tenantId: string, sha256: string): Promise<boolean> {
    return this.bySha.has(`${tenantId}:${sha256}`);
  }
}

export class FixedClock implements ClockPort {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return new Date(this.fixed.getTime());
  }

  nowIso(): string {
    return this.fixed.toISOString();
  }
}

export class MemoryLogger implements LoggerPort {
  readonly entries: LogEntry[] = [];

  log(entry: LogEntry): void {
    this.entries.push(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log({ level: "debug", message, context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log({ level: "info", message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log({ level: "warn", message, context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log({ level: "error", message, context });
  }
}