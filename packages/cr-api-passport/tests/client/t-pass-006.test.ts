import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { PassportClient } from "../../src/client/passport-client.js";

describe("T-PASS-006 — credenciales BCCR SDDE", () => {
  it("sin BCCR_SDDE_TOKEN falla sin tráfico HTTP", async () => {
    const passport = await getPassportById("cr.bccr.sdde");
    expect(passport).toBeDefined();
    const client = new PassportClient({
      mode: "live",
      env: {},
      fetch: async () => {
        throw new Error("network should not be called");
      },
    });
    const res = await client.query(passport!, "getEconomicSeries", {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("ERR_AUTH_MISSING_CREDENTIALS");
    }
    expect(client.getHttpCallCount()).toBe(0);
  });
});