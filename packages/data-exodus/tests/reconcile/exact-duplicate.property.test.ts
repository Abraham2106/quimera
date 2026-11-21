import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  reconcileDetect,
  totalRecordCount,
  type NormalizedClient,
  type ReconcileDataset,
} from "../../src/reconcile/index.js";

const hashArb = fc
  .array(fc.constantFrom(..."0123456789abcdef".split("")), {
    minLength: 64,
    maxLength: 64,
  })
  .map((chars) => chars.join(""));

const clientArb = (id: string, recordHash: string): NormalizedClient => ({
  id,
  legalName: `Cliente ${id}`,
  recordHash,
  provenance: [
    {
      artifactId: "22222222-2222-4222-8222-222222222222",
      sourceLocator: `row:${id}`,
    },
  ],
});

describe("reconcile exact duplicate property", () => {
  it("duplicado exacto por hash siempre se detecta y conserva N filas", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.array(hashArb, { minLength: 1, maxLength: 6 }),
        (dupSize, hashes) => {
          const uniqueHashes = [...new Set(hashes)];
          if (uniqueHashes.length === 0) {
            return true;
          }
          const targetHash = uniqueHashes[0]!;

          const clients: NormalizedClient[] = [];
          let seq = 0;
          for (const h of uniqueHashes) {
            clients.push(clientArb(`u-${seq++}`, h));
          }
          for (let i = 0; i < dupSize; i += 1) {
            clients.push(clientArb(`d-${seq++}`, targetHash));
          }

          const dataset: ReconcileDataset = {
            clients,
            invoices: [],
            payments: [],
          };

          const before = totalRecordCount(dataset);
          const result = reconcileDetect(dataset);
          const after = totalRecordCount(result.dataset);

          expect(after).toBe(before);

          const exact = result.conflicts.filter((c) => c.conflictCode === "EXACT_DUPLICATE");
          const duplicateCluster = exact.find((c) =>
            c.candidateRecordIds.some((id) => id.startsWith("d-")),
          );
          expect(duplicateCluster).toBeDefined();
          expect(duplicateCluster!.candidateRecordIds.length).toBeGreaterThanOrEqual(2);
          expect(duplicateCluster!.autoResolved).toBe(true);
          return true;
        },
      ),
      { numRuns: 40 },
    );
  });
});