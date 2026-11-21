import { jaroWinkler } from "./jaro-winkler.js";
import { normalizeLegalName, sameTaxId } from "./normalize-name.js";
import { conflictFingerprint } from "./fingerprint.js";
import type { DetectedConflict, NormalizedClient } from "./types.js";

const JW_THRESHOLD = 0.88;

type ClientNorm = NormalizedClient & { normName: string };

function isConflictingIdentityPair(a: ClientNorm, b: ClientNorm): boolean {
  if (a.normName !== b.normName || a.normName.length === 0) {
    return false;
  }
  if (!a.taxId || !b.taxId) {
    return false;
  }
  return !sameTaxId(a.taxId, b.taxId);
}

/** Par probable: nombre normalizado equivalente o variante con JW alto sobre el mismo texto base. */
function isProbableDuplicatePair(a: ClientNorm, b: ClientNorm): boolean {
  if (sameTaxId(a.taxId, b.taxId)) {
    return false;
  }
  if (isConflictingIdentityPair(a, b)) {
    return false;
  }
  if (a.normName.length === 0 || b.normName.length === 0) {
    return false;
  }
  if (a.normName === b.normName) {
    return true;
  }
  const sim = jaroWinkler(a.normName, b.normName);
  if (sim < JW_THRESHOLD) {
    return false;
  }
  const shorter = a.normName.length <= b.normName.length ? a.normName : b.normName;
  const longer = shorter === a.normName ? b.normName : a.normName;
  if (!longer.startsWith(shorter) && !shorter.startsWith(longer)) {
    return false;
  }
  return true;
}

function groupProbableByTaxId(normed: ClientNorm[]): DetectedConflict[] {
  const byTax = new Map<string, ClientNorm[]>();
  for (const c of normed) {
    if (!c.taxId) {
      continue;
    }
    const digits = c.taxId.replace(/\D/g, "");
    if (digits.length === 0) {
      continue;
    }
    const list = byTax.get(digits) ?? [];
    list.push(c);
    byTax.set(digits, list);
  }

  const conflicts: DetectedConflict[] = [];
  for (const group of byTax.values()) {
    if (group.length < 2) {
      continue;
    }
    const legalNames = new Set(group.map((g) => g.legalName.trim()).filter((n) => n.length > 0));
    if (legalNames.size < 2) {
      continue;
    }
    const ids = group.map((g) => g.id).sort();
    conflicts.push({
      conflictCode: "PROBABLE_DUPLICATE",
      severity: "BLOCKING",
      autoResolved: false,
      candidateRecordIds: ids,
      summary: "Clientes con la misma identificación y razones sociales normalizadas distintas.",
      fingerprint: conflictFingerprint("PROBABLE_DUPLICATE", ids),
    });
  }
  return conflicts;
}

export function detectProbableDuplicates(clients: NormalizedClient[]): DetectedConflict[] {
  if (clients.length < 2) {
    return [];
  }

  const normed: ClientNorm[] = clients.map((c) => ({
    ...c,
    normName: normalizeLegalName(c.legalName),
  }));

  const conflicts: DetectedConflict[] = [...groupProbableByTaxId(normed)];
  const clustered = new Set<string>();
  for (const c of conflicts) {
    clustered.add(c.candidateRecordIds.join("|"));
  }

  for (let i = 0; i < normed.length; i += 1) {
    for (let j = i + 1; j < normed.length; j += 1) {
      const a = normed[i]!;
      const b = normed[j]!;
      if (sameTaxId(a.taxId, b.taxId) && a.taxId && b.taxId) {
        continue;
      }
      if (!isProbableDuplicatePair(a, b)) {
        continue;
      }
      const ids = [a.id, b.id].sort();
      const clusterKey = ids.join("|");
      if (clustered.has(clusterKey)) {
        continue;
      }
      clustered.add(clusterKey);
      conflicts.push({
        conflictCode: "PROBABLE_DUPLICATE",
        severity: "BLOCKING",
        autoResolved: false,
        candidateRecordIds: ids,
        summary:
          a.normName === b.normName
            ? "Clientes con razón social normalizada idéntica sin misma cédula."
            : `Clientes con similitud Jaro-Winkler ≥ ${JW_THRESHOLD} sobre el mismo texto base.`,
        fingerprint: conflictFingerprint("PROBABLE_DUPLICATE", ids),
      });
    }
  }

  return conflicts;
}