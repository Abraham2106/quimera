import path from "node:path";
import type { QuimeraError } from "@quimera/core";
import { randomUUID } from "node:crypto";

export const MODULE_NAME = "@quimera/data-exodus" as const;

const SHA256_HEX = /^[a-f0-9]{64}$/;
const CAS_URI =
  /^cas:\/\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})$/;

export function quimeraError(
  code: string,
  category: QuimeraError["category"],
  message: string,
  retryable: boolean,
): QuimeraError {
  return {
    code,
    category,
    message,
    retryable,
    correlationId: randomUUID(),
    module: MODULE_NAME,
  };
}

export function isPathTraversalOriginalName(originalName: string): boolean {
  if (originalName.length === 0) {
    return true;
  }
  if (originalName.includes("\0")) {
    return true;
  }
  if (originalName.includes("..")) {
    return true;
  }
  if (path.isAbsolute(originalName)) {
    return true;
  }
  const normalized = path.normalize(originalName);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return true;
  }
  if (/^[a-zA-Z]:[\\/]/.test(originalName)) {
    return true;
  }
  return false;
}

export function parseCasStorageUri(
  storageUri: string,
): { sha256: string; prefix: string } | null {
  const match = CAS_URI.exec(storageUri);
  if (!match) {
    return null;
  }
  const prefix = match[1]!;
  const sha256 = match[2]!;
  if (!SHA256_HEX.test(sha256)) {
    return null;
  }
  if (prefix !== sha256.slice(0, 2)) {
    return null;
  }
  return { sha256, prefix };
}

export function casRelativeSegments(sha256: string): [string, string, string] {
  return [sha256.slice(0, 2), sha256.slice(2, 4), sha256];
}

export function resolveCasFilePath(rootDir: string, sha256: string): string {
  if (!SHA256_HEX.test(sha256)) {
    throw new Error("invalid sha256");
  }
  const [aa, cd, fileName] = casRelativeSegments(sha256);
  const candidate = path.join(rootDir, aa, cd, fileName);
  return assertContainedPath(rootDir, candidate);
}

export function assertContainedPath(rootDir: string, targetPath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);
  const rootWithSep =
    resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    throw pathTraversalError("resolved path escapes CAS root");
  }
  return resolvedTarget;
}

export function pathTraversalError(message: string): QuimeraError {
  return quimeraError(
    "ERR_SEC_PATH_TRAVERSAL",
    "SECURITY",
    message,
    false,
  );
}