import type { ConflictCode } from "@quimera/core";

export function conflictFingerprint(code: ConflictCode, recordIds: string[]): string {
  const sorted = [...recordIds].sort();
  return `${code}:${sorted.join("|")}`;
}