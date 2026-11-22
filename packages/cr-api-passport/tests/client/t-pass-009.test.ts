import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { cacheKey } from "../../src/client/cache.js";
import { PassportClient } from "../../src/client/passport-client.js";

describe("T-PASS-009 — versión del pasaporte en la caché y revalidación", () => {
  it("cacheKey incluye passportVersion", () => {
    const base = {
      passportId: "cr.hacienda.cabys",
      operation: "searchByText",
      params: { q: "aire" },
    };
    const v1 = cacheKey({ ...base, passportVersion: "1.0.0" });
    const v2 = cacheKey({ ...base, passportVersion: "2.0.0" });
    expect(v1).not.toBe(v2);
  });

  it("un cambio de passportVersion evita el hit de caché", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    expect(passport).toBeDefined();
    const client = new PassportClient({ mode: "fixture" });

    const first = await client.query(passport!, "searchByText", { q: "refrigeracion" });
    expect(first.ok).toBe(true);

    const upgraded = { ...passport!, passportVersion: "2.0.0" };
    const second = await client.query(upgraded, "searchByText", { q: "refrigeracion" });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.meta.fromCache).toBe(false);
      expect(second.meta.passportVersion).toBe("2.0.0");
    }
    expect(client.getHttpCallCount()).toBe(2);
  });

  it("revalida el schema en cada hit y reporta deriva", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    expect(passport).toBeDefined();
    const cachedBody: Record<string, unknown> = {
      total: 1,
      cantidad: 1,
      cabys: [{ codigo: "0000000000000", descripcion: "aire", impuesto: 0 }],
    };
    const client = new PassportClient({
      mode: "fixture",
      fixtureResolver: async () => ({ status: 200, body: cachedBody }),
    });

    const first = await client.query(passport!, "searchByText", { q: "refrigeracion" });
    expect(first.ok).toBe(true);

    delete cachedBody.cabys;
    const second = await client.query(passport!, "searchByText", { q: "refrigeracion" });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("ERR_PASSPORT_CONTRACT_DRIFT");
      expect(second.error.details?.fromCache).toBe(true);
    }

    const callsBeforeRefetch = client.getHttpCallCount();
    const third = await client.query(passport!, "searchByText", { q: "refrigeracion" });
    expect(third.ok).toBe(false);
    expect(client.getHttpCallCount()).toBe(callsBeforeRefetch + 1);
  });
});
