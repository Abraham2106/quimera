import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FISCAL_MINOR_SCALE,
  addFiscalAmounts,
  parseCrMoney,
} from "./index.js";

describe("T-CORE-009 — dinero exacto BigInt", () => {
  it("suma fiscal 5 decimales coincide con acumulación BigInt (≥200)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .tuple(fc.integer({ min: 0, max: 99999 }), fc.integer({ min: 0, max: 99999 }))
            .map(([whole, frac]) => `${whole}.${String(frac).padStart(5, "0")}`),
          { minLength: 1, maxLength: 12 },
        ),
        (decimals) => {
          const exact = addFiscalAmounts(decimals);
          const manual = decimals.reduce(
            (acc, d) =>
              acc + parseCrMoney(d, "CRC", FISCAL_MINOR_SCALE).amountMinor,
            0n,
          );
          expect(exact).toBe(manual);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("IEEE 754 deriva en float pero BigInt fiscal es exacto", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addFiscalAmounts(["0.10000", "0.20000"])).toBe(30000n);
  });
});