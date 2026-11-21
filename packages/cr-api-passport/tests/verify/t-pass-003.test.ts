import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { verifyPassportWithFixtureFile } from "../../src/verify/verify.js";
import { PASSPORT_ERROR_CODES } from "../../src/errors.js";
import { verifyPassport, driftToQuimeraError } from "../../src/verify/verify.js";
import { PassportClient } from "../../src/client/passport-client.js";

describe("T-PASS-003 — detección de deriva contractual", () => {
  it("fixture mutado dispara diff en campo requerido", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    expect(passport).toBeDefined();
    const issues = await verifyPassportWithFixtureFile(
      passport!,
      "cabys-drift-missing-field.json",
      "searchByText",
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.path.includes("impuesto"))).toBe(true);

    const err = driftToQuimeraError({
      passportId: passport!.passportId,
      status: "DRIFT_DETECTED",
      tests: [
        {
          id: "drift",
          operation: "searchByText",
          result: "DRIFT_DETECTED",
          diff: issues,
        },
      ],
    });
    expect(err.code).toBe(PASSPORT_ERROR_CODES.CONTRACT_DRIFT);
    expect(err.details?.diff).toBeTruthy();
  });

  it("verify en modo fixture pasa contrato baseline", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    const client = new PassportClient({ mode: "fixture" });
    const report = await verifyPassport(passport!, { client });
    expect(report.status).toBe("PASS");
  });
});