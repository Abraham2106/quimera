import { normalizeLegalName } from "./normalize-name.js";
import { conflictFingerprint } from "./fingerprint.js";
import type { DetectedConflict, NormalizedClient } from "./types.js";

export function detectConflictingIdentities(clients: NormalizedClient[]): DetectedConflict[] {
  const byNorm = new Map<string, NormalizedClient[]>();
  for (const c of clients) {
    const norm = normalizeLegalName(c.legalName);
    if (!norm) {
      continue;
    }
    const list = byNorm.get(norm) ?? [];
    list.push(c);
    byNorm.set(norm, list);
  }

  const conflicts: DetectedConflict[] = [];
  for (const group of byNorm.values()) {
    if (group.length < 2) {
      continue;
    }
    const taxIds = new Set<string>();
    for (const c of group) {
      if (c.taxId) {
        taxIds.add(c.taxId.replace(/\D/g, ""));
      }
    }
    if (taxIds.size < 2) {
      continue;
    }
    const ids = group.map((c) => c.id);
    conflicts.push({
      conflictCode: "CONFLICTING_IDENTITY",
      severity: "BLOCKING",
      autoResolved: false,
      candidateRecordIds: ids,
      summary: `Mismo nombre normalizado con ${taxIds.size} cédulas distintas.`,
      fingerprint: conflictFingerprint("CONFLICTING_IDENTITY", ids),
    });
  }
  return conflicts;
}