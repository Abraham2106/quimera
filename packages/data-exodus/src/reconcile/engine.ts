import type { ConflictCode } from "@quimera/core";

import { detectConflictingIdentities } from "./detect-conflicting-identity.js";
import { detectExactDuplicates } from "./detect-exact-duplicate.js";
import { detectMonetaryMismatches } from "./detect-monetary-mismatch.js";
import { detectOrphanAndInvalidReferences } from "./detect-orphan-invalid.js";
import { detectProbableDuplicates } from "./detect-probable-duplicate.js";
import { detectUnreconcilableBalances } from "./detect-unreconcilable-balance.js";
import type { DetectedConflict, ReconcileDataset, ReconcileResult } from "./types.js";

function tallyConflicts(conflicts: DetectedConflict[]): Partial<Record<ConflictCode, number>> {
  const counts: Partial<Record<ConflictCode, number>> = {};
  for (const c of conflicts) {
    counts[c.conflictCode] = (counts[c.conflictCode] ?? 0) + 1;
  }
  return counts;
}

/**
 * Detección pura sobre filas normalizadas en memoria. No fusiona ni descarta registros.
 */
export function reconcileDetect(dataset: ReconcileDataset): ReconcileResult {
  const conflicts: DetectedConflict[] = [
    ...detectExactDuplicates(dataset.clients, dataset.invoices),
    ...detectProbableDuplicates(dataset.clients),
    ...detectConflictingIdentities(dataset.clients),
    ...detectMonetaryMismatches(dataset.invoices),
    ...detectOrphanAndInvalidReferences(dataset.clients, dataset.invoices, dataset.payments),
    ...detectUnreconcilableBalances(
      dataset.invoices,
      dataset.payments,
      dataset.balances ?? [],
    ),
  ];

  return {
    dataset,
    conflicts,
    countsByCode: tallyConflicts(conflicts),
  };
}

export function totalRecordCount(dataset: ReconcileDataset): number {
  return (
    dataset.clients.length +
    dataset.invoices.length +
    dataset.payments.length +
    (dataset.balances?.length ?? 0)
  );
}