import { describe, expect, it } from "vitest";

import { createClairicStubAdapter } from "./clairic-stub-adapter.js";
import { ERR_CLAIRIC_AI_DISABLED } from "./constants.js";

const schema = {
  type: "object",
  properties: { note: { type: "string" } },
} as const;

describe("T-CLAI-001 — QUIMERA_AI_ENABLED", () => {
  it("deshabilitado explícitamente devuelve un error tipado", async () => {
    const adapter = createClairicStubAdapter({
      env: { QUIMERA_AI_ENABLED: "false" },
    });
    const result = await adapter.extract({ schema, text: "Cliente: ACME" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERR_CLAIRIC_AI_DISABLED);
      expect(result.error.category).toBe("SECURITY");
      expect(result.error.details?.envVar).toBe("QUIMERA_AI_ENABLED");
    }
  });

  it("sin la variable queda deshabilitado por defecto", async () => {
    const adapter = createClairicStubAdapter({ env: {} });
    const result = await adapter.extract({ schema, text: "Cliente: ACME" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERR_CLAIRIC_AI_DISABLED);
    }
  });

  it("con QUIMERA_AI_ENABLED=true ejecuta la extracción", async () => {
    const adapter = createClairicStubAdapter({
      env: { QUIMERA_AI_ENABLED: "true" },
    });
    const result = await adapter.extract<{ note: string }>({
      schema,
      text: "Cliente: ACME",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.value).toEqual({ note: "Cliente: ACME" });
    }
  });
});
