import { conflictFingerprint } from "./fingerprint.js";
import type { DetectedConflict, NormalizedInvoice } from "./types.js";

export function detectMonetaryMismatches(invoices: NormalizedInvoice[]): DetectedConflict[] {
  const byNumber = new Map<string, NormalizedInvoice[]>();
  for (const inv of invoices) {
    const key = inv.invoiceNumber.trim();
    if (!key) {
      continue;
    }
    const list = byNumber.get(key) ?? [];
    list.push(inv);
    byNumber.set(key, list);
  }

  const conflicts: DetectedConflict[] = [];
  for (const group of byNumber.values()) {
    if (group.length < 2) {
      continue;
    }
    const amounts = new Set(group.map((g) => `${g.currency}:${g.amountMinor.toString()}`));
    if (amounts.size <= 1) {
      continue;
    }
    const ids = group.map((g) => g.id);
    conflicts.push({
      conflictCode: "MONETARY_MISMATCH",
      severity: "BLOCKING",
      autoResolved: false,
      candidateRecordIds: ids,
      summary: `Factura ${group[0]!.invoiceNumber}: montos distintos entre fuentes.`,
      fingerprint: conflictFingerprint("MONETARY_MISMATCH", ids),
    });
  }
  return conflicts;
}