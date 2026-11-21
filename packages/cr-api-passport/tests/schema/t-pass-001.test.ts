import { describe, expect, it } from "vitest";
import { ApiPassportSchema } from "../../src/schema/api-passport.js";
import { loadAllPassports } from "../../src/registry.js";

describe("T-PASS-001 — manifiestos validan ApiPassportSchema", () => {
  it("valida todos los YAML del catálogo", async () => {
    const passports = await loadAllPassports();
    expect(passports.length).toBeGreaterThanOrEqual(6);
    for (const p of passports) {
      expect(() => ApiPassportSchema.parse(p)).not.toThrow();
    }
  });
});