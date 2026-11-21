import { describe, expect, it } from "vitest";

import { colonesToMinor, formatColones, lineTotals } from "../../web/src/money.js";

describe("formato de colones", () => {
  it("convierte 1.500,00 a 150000 unidades menores y lo vuelve a mostrar", () => {
    expect(colonesToMinor("1.500,00")).toBe(150000);
    expect(colonesToMinor("1500.00")).toBe(150000);
    expect(formatColones(150000)).toBe("₡1.500,00");
  });

  it("calcula IVA 13% en enteros", () => {
    const totals = lineTotals(150000, 2);
    expect(totals.subtotalMinor).toBe(300000);
    expect(totals.taxMinor).toBe(39000);
    expect(totals.totalMinor).toBe(339000);
  });

  it("rechaza texto que no es un monto", () => {
    expect(colonesToMinor("abc")).toBeNull();
  });
});
