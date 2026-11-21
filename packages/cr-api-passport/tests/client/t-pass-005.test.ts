import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { PassportClient } from "../../src/client/passport-client.js";

describe("T-PASS-005 — caché TTL", () => {
  it("segunda consulta idéntica usa caché sin HTTP adicional", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    expect(passport).toBeDefined();
    const client = new PassportClient({ mode: "fixture" });
    const params = { q: "refrigeracion" };

    const first = await client.query(passport!, "searchByText", params);
    expect(first.ok).toBe(true);
    expect(client.getHttpCallCount()).toBe(1);

    const second = await client.query(passport!, "searchByText", params);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.meta.fromCache).toBe(true);
      expect(second.meta.httpCalls).toBe(0);
    }
    expect(client.getHttpCallCount()).toBe(1);
  });
});