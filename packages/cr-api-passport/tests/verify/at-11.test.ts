import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { PassportClient } from "../../src/client/passport-client.js";
import { verifyPassportWithFixtureFile } from "../../src/verify/verify.js";
import { runCli } from "../../src/cli.js";

describe("AT-11 — consulta, caché, deriva y auth BCCR", () => {
  it("escenario integrado en modo fixture", async () => {
    const cabys = await getPassportById("cr.hacienda.cabys");
    const bccr = await getPassportById("cr.bccr.sdde");
    expect(cabys && bccr).toBeTruthy();

    const client = new PassportClient({ mode: "fixture" });
    const params = { q: "refrigeracion" };
    const first = await client.query(cabys!, "searchByText", params);
    const second = await client.query(cabys!, "searchByText", params);
    expect(first.ok && second.ok).toBe(true);
    if (second.ok) {
      expect(second.meta.fromCache).toBe(true);
    }

    const drift = await verifyPassportWithFixtureFile(
      cabys!,
      "cabys-drift-missing-field.json",
      "searchByText",
    );
    expect(drift.length).toBeGreaterThan(0);

    const bccrClient = new PassportClient({ mode: "live", env: {}, fetch: async () => { throw new Error("no"); } });
    const noAuth = await bccrClient.query(bccr!, "getEconomicSeries", {});
    expect(noAuth.ok).toBe(false);
    if (!noAuth.ok) {
      expect(noAuth.error.code).toBe("ERR_AUTH_MISSING_CREDENTIALS");
    }

    const list = await runCli(["list", "--json"]);
    expect(list.exitCode).toBe(0);
  });
});