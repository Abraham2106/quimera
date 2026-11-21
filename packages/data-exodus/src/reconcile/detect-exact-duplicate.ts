import type { DetectedConflict, NormalizedClient, NormalizedInvoice } from "./types.js";
import { conflictFingerprint } from "./fingerprint.js";

type Hashable = NormalizedClient | NormalizedInvoice;

function duplicateKey(record: Hashable): string | undefined {
  if (record.recordHash) {
    return `hash:${record.recordHash}`;
  }
  if (record.fiscalKey50 && "amountMinor" in record) {
    const inv = record as NormalizedInvoice;
    return `fiscal:${record.fiscalKey50}:${inv.currency}:${inv.amountMinor.toString()}`;
  }
  return undefined;
}

function detectExactDuplicateGroup(
  records: Hashable[],
  label: string,
): DetectedConflict[] {
  const groups = new Map<string, Hashable[]>();
  for (const r of records) {
    const key = duplicateKey(r);
    if (!key) {
      continue;
    }
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }

  const conflicts: DetectedConflict[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    const ids = group.map((r) => r.id);
    conflicts.push({
      conflictCode: "EXACT_DUPLICATE",
      severity: "INFO",
      autoResolved: true,
      candidateRecordIds: ids,
      summary: `${label}: ${group.length} registros con equivalencia exacta (hash o clave fiscal + montos).`,
      fingerprint: conflictFingerprint("EXACT_DUPLICATE", ids),
    });
  }
  return conflicts;
}

export function detectExactDuplicates(
  clients: NormalizedClient[],
  invoices: NormalizedInvoice[],
): DetectedConflict[] {
  return [
    ...detectExactDuplicateGroup(clients, "Cliente"),
    ...detectExactDuplicateGroup(invoices, "Factura"),
  ];
}