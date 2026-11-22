import { describe, expect, it } from "vitest";

import { CONFIDENCE_LOW_MARKER, W_AI_LOW_CONFIDENCE } from "./constants.js";
import { createClairicStubAdapter } from "./clairic-stub-adapter.js";
import { lowConfidenceConflict } from "./low-confidence.js";
import type { ClairicFieldMeta } from "./stub-extract.js";

const schema = {
  type: "object",
  properties: {
    note: { type: "string" },
    total: { type: "number" },
  },
} as const;

describe("T-CLAI-003 — confidence gate (QR-CLAI-003)", () => {
  const adapter = createClairicStubAdapter({ env: { QUIMERA_AI_ENABLED: "true" } });

  it("CONFIDENCE_LOW marker yields confidence 0.72, pNull 0.2 and lowConfidence flag", async () => {
    const result = await adapter.extract({
      schema,
      text: `Preface ${CONFIDENCE_LOW_MARKER} trailer`,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const meta of Object.values(result.data.fields) as ClairicFieldMeta[]) {
        expect(meta.confidence).toBe(0.72);
        expect(meta.pNull).toBe(0.2);
        expect(meta.lowConfidence).toBe(true);
      }
      expect(lowConfidenceConflict({ confidence: 0.72, pNull: 0.2 })).toBe(
        "AI_LOW_CONFIDENCE",
      );
      expect(result.data.conflictCodes).toContain("AI_LOW_CONFIDENCE");
      expect(result.warnings.some((w) => w.code === W_AI_LOW_CONFIDENCE)).toBe(
        true,
      );
    }
  });

  it("sin baja confianza no emite conflictos ni advertencias", async () => {
    const result = await adapter.extract({ schema, text: "total: 1200" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.conflictCodes).toEqual([]);
      expect(result.warnings).toEqual([]);
    }
  });

  it("lowConfidenceConflict returns null when thresholds are met", () => {
    expect(lowConfidenceConflict({ confidence: 0.95, pNull: 0.05 })).toBeNull();
  });

  it("marks fiscal field total with requiresHumanReview while valid", async () => {
    const result = await adapter.extract({
      schema,
      text: "total: 1200",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const totalMeta = result.data.fields["total"];
      expect(totalMeta?.valid).toBe(true);
      expect(totalMeta?.requiresHumanReview).toBe(true);
    }
  });
});