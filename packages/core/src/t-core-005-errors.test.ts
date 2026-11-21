import { describe, expect, it } from "vitest";
import { QuimeraErrorSchema } from "./index.js";

describe("T-CORE-005 — QuimeraError", () => {
  it("exige module y código ERR_*", () => {
    const err = QuimeraErrorSchema.parse({
      code: "ERR_CONTRACT_VERSION",
      category: "CONTRACT",
      message: "incompatible",
      retryable: true,
      correlationId: "018f4e7a-90e0-7000-8000-000000000010",
      module: "@quimera/data-exodus",
    });
    expect(err.module).toBe("@quimera/data-exodus");
  });

  it("rechaza códigos fuera de patrón", () => {
    expect(() =>
      QuimeraErrorSchema.parse({
        code: "VALIDATION_FAILED",
        category: "VALIDATION",
        message: "x",
        retryable: false,
        correlationId: "018f4e7a-90e0-7000-8000-000000000010",
        module: "@quimera/core",
      }),
    ).toThrow();
  });
});