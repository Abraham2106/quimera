import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { PassportClient } from "../../src/client/passport-client.js";

describe("T-PASS-002 — pasaportes MVP en modo fixture offline", () => {
  const ids = ["cr.hacienda.taxpayer", "cr.hacienda.cabys", "cr.hacienda.fx", "cr.bccr.sdde"];

  it.each(ids)("consulta %s sin red", async (passportId) => {
    const passport = await getPassportById(passportId);
    expect(passport).toBeDefined();
    const client = new PassportClient({ mode: "fixture", env: { BCCR_SDDE_TOKEN: "test-token" } });
    const op = Object.keys(passport!.operations)[0]!;
    const params =
      passportId === "cr.hacienda.cabys"
        ? { q: "refrigeracion" }
        : passportId === "cr.hacienda.taxpayer"
          ? { identificacion: "3101123456" }
          : {};
    const res = await client.query(passport!, op, params);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.meta.untrustedExternalData).toBe(true);
    }
  });
});