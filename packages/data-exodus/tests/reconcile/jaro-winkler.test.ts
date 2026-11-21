import { describe, expect, it } from "vitest";

import { jaroWinkler, normalizeLegalName } from "../../src/reconcile/index.js";

describe("jaro-winkler + normalización", () => {
  it("supera 0.88 entre variantes societarias típicas", () => {
    const a = normalizeLegalName("Distribuidora Rodríguez");
    const b = normalizeLegalName("Distribuidora Rodríguez S.A.");
    expect(jaroWinkler(a, b)).toBeGreaterThanOrEqual(0.88);
  });
});