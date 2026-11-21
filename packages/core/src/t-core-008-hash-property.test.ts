import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeCrIdentification, sha256CanonicalJson } from "./index.js";

describe("T-CORE-008 — determinismo hash y CR ID", () => {
  it("hash canónico invariante al orden de claves (≥200)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (obj) => {
        const permuted = { ...obj };
        const hashA = sha256CanonicalJson(permuted);
        const reversedKeys = Object.keys(permuted).reverse();
        const reordered: Record<string, unknown> = {};
        for (const key of reversedKeys) {
          reordered[key] = permuted[key];
        }
        const hashB = sha256CanonicalJson(reordered);
        expect(hashB).toBe(hashA);
      }),
      { numRuns: 200 },
    );
  });

  it("normalización CR solo dígitos 9–12", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 9, max: 12 }).chain((len) =>
          fc.array(fc.integer({ min: 0, max: 9 }), {
            minLength: len,
            maxLength: len,
          }),
        ),
        (digits) => {
          const noisy = `${digits[0]}-${digits.slice(1).join("")} `;
          expect(normalizeCrIdentification(noisy)).toBe(digits.join(""));
        },
      ),
      { numRuns: 200 },
    );
  });
});