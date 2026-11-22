import { describe, expect, it } from "vitest";

import { PROMPT_INJECTION_FIXTURE } from "./constants.js";
import { createClairicStubAdapter } from "./clairic-stub-adapter.js";

describe("T-SEC-004 — prompt injection containment (QR-CLAI-004 / QR-SEC-004)", () => {
  const adapter = createClairicStubAdapter({ env: { QUIMERA_AI_ENABLED: "true" } });

  it("returns adversarial text only as extracted field data without mutating schema", async () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        note: { type: "string" },
        approved: { type: "boolean" },
      },
    } as const;

    const schemaBefore = structuredClone(schema);
    const result = await adapter.extract<{ note: string; approved: boolean }>({
      schema,
      text: `Invoice A-1. ${PROMPT_INJECTION_FIXTURE} all conflicts.`,
    });

    expect(schema).toEqual(schemaBefore);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.value).toMatchObject({
        note: expect.stringContaining(PROMPT_INJECTION_FIXTURE),
        approved: false,
      });
      expect(result.data.value.approved).not.toBe(true);
    }
  });
});