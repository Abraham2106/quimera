import { describe, expect, it } from "vitest";

import {
  CLAIRIC_STUB_PROVIDER_ID,
  QUIMERA_ADAPTER_CLAIRIC_PACKAGE,
  createClairicStubAdapter,
} from "./index.js";

describe("AT-18 — adapter-clairic standalone smoke", () => {
  it("exports package id and stub provider", () => {
    expect(QUIMERA_ADAPTER_CLAIRIC_PACKAGE).toBe("@quimera/adapter-clairic");
    const adapter = createClairicStubAdapter({ env: { QUIMERA_AI_ENABLED: "true" } });
    expect(adapter.providerId).toBe(CLAIRIC_STUB_PROVIDER_ID);
  });

  it("extract succeeds without network for minimal schema", async () => {
    const adapter = createClairicStubAdapter({ env: { QUIMERA_AI_ENABLED: "true" } });
    const result = await adapter.extract<{ note: string }>({
      schema: {
        type: "object",
        properties: { note: { type: "string" } },
      },
      text: "Cliente: ACME",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.value).toEqual({ note: "Cliente: ACME" });
    }
  });
});