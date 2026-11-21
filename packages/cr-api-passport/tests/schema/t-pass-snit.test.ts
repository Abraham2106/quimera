import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { PassportClient } from "../../src/client/passport-client.js";
import { ApiPassportSchema } from "../../src/schema/api-passport.js";

const SNIT_PASSPORT_ID = "cr.snit.geodata";

describe("T-PASS-SNIT — ficha SNIT (QR-PASS-008)", () => {
  it("carga pasaporte por id con accessTier public_ogc", async () => {
    const passport = await getPassportById(SNIT_PASSPORT_ID);
    expect(passport).toBeDefined();
    expect(passport!.passportId).toBe(SNIT_PASSPORT_ID);
    expect(passport!.accessTier).toBe("public_ogc");
    expect(passport!.executable).toBe(false);
    expect(() => ApiPassportSchema.parse(passport)).not.toThrow();
  });

  it("no declara operaciones privadas ni credenciales", async () => {
    const passport = await getPassportById(SNIT_PASSPORT_ID);
    expect(passport!.auth.type).toBe("public");
    expect(passport!.auth.credentialsRequired).toBe(false);
    expect(passport!.auth.envVar).toBeUndefined();
    expect(Object.keys(passport!.operations)).toHaveLength(0);
    expect(passport!.contractTests).toHaveLength(0);
  });

  it("modo fixture no requiere token ni red", async () => {
    await getPassportById(SNIT_PASSPORT_ID);
    const client = new PassportClient({
      mode: "fixture",
      env: {},
      fetch: async () => {
        throw new Error("live network must not be used in fixture mode");
      },
    });
    expect(client.getHttpCallCount()).toBe(0);
  });
});