import { describe, expect, it } from "vitest";
import { isContractCompatible } from "./index.js";

describe("T-CORE-007 — compatibilidad SemVer", () => {
  it("acepta 1.2.0 -> 1.3.0 dentro del mismo major", () => {
    expect(isContractCompatible("1.3.0", "^1.0.0")).toBe(true);
    expect(isContractCompatible("1.3.0", "1.2.0")).toBe(true);
  });

  it("rechaza 1.x -> 2.0.0", () => {
    expect(isContractCompatible("2.0.0", "^1.0.0")).toBe(false);
    expect(isContractCompatible("2.0.0", "1.9.9")).toBe(false);
  });
});