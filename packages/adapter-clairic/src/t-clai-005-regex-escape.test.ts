import { describe, expect, it } from "vitest";

import { createClairicStubAdapter } from "./clairic-stub-adapter.js";

const adapter = createClairicStubAdapter({
  env: { QUIMERA_AI_ENABLED: "true" },
});

describe("T-CLAI-005 — metacaracteres en nombres de campo", () => {
  it("extrae campos con paréntesis y punto sin interpretarlos como regex", async () => {
    const schema = {
      type: "object",
      properties: {
        "total(usd)": { type: "number" },
        "customer.name": { type: "string" },
      },
    } as const;

    const result = await adapter.extract({
      schema,
      text: "total(usd): 1200\ncustomer.name: ACME",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.value).toEqual({
        "total(usd)": 1200,
        "customer.name": "ACME",
      });
    }
  });

  it("no lanza con un nombre inválido como patrón regex", async () => {
    const schema = {
      type: "object",
      properties: { "a+b(c)[d]": { type: "string" } },
    } as const;

    const result = await adapter.extract({
      schema,
      text: "a+b(c)[d]: ok",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.value).toEqual({ "a+b(c)[d]": "ok" });
    }
  });
});
