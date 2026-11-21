import { describe, expect, it } from "vitest";

import { loadDemoHvac1000 } from "../../src/demo/load-demo-hvac-1000.js";
import { resolveDemoHvacFixtureRoot } from "../../src/demo/resolve-repo-root.js";
import { totalRecordCount } from "../../src/reconcile/index.js";

const BLOCKING_NO_AUTO = new Set([
  "PROBABLE_DUPLICATE",
  "CONFLICTING_IDENTITY",
  "INVALID_REFERENCE",
  "UNRECONCILABLE_BALANCE",
  "MONETARY_MISMATCH",
]);

describe("demo-hvac-1000 fixture (on disk)", () => {
  it("carga filas reales y detecta anomalías sembradas", async () => {
    const root = resolveDemoHvacFixtureRoot(import.meta.url);
    const { dataset, rowCount, reconcile } = await loadDemoHvac1000(root);

    const inputCount =
      dataset.clients.length + dataset.invoices.length + dataset.payments.length;

    expect(rowCount).toBeGreaterThanOrEqual(1000);
    expect(totalRecordCount(reconcile.dataset)).toBe(
      inputCount + (dataset.balances?.length ?? 0),
    );
    expect(reconcile.dataset.clients.length).toBe(dataset.clients.length);
    expect(reconcile.dataset.invoices.length).toBe(dataset.invoices.length);
    expect(reconcile.dataset.payments.length).toBe(dataset.payments.length);

    expect(reconcile.countsByCode.PROBABLE_DUPLICATE).toBe(40);
    expect(reconcile.countsByCode.CONFLICTING_IDENTITY).toBe(3);
    expect(reconcile.countsByCode.UNRECONCILABLE_BALANCE).toBe(1);

    const dupInvoiceConflicts =
      (reconcile.countsByCode.EXACT_DUPLICATE ?? 0) +
      (reconcile.countsByCode.MONETARY_MISMATCH ?? 0);
    expect(dupInvoiceConflicts).toBe(12);

    const paymentIssues =
      (reconcile.countsByCode.ORPHAN_RECORD ?? 0) +
      (reconcile.countsByCode.INVALID_REFERENCE ?? 0);
    expect(paymentIssues).toBe(7);
    expect(reconcile.countsByCode.INVALID_REFERENCE).toBe(7);

    const blocking = reconcile.conflicts.filter(
      (c) => BLOCKING_NO_AUTO.has(c.conflictCode) && !c.autoResolved,
    );
    expect(blocking.every((c) => c.autoResolved === false)).toBe(true);
  });
});