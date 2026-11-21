import { describe, expect, it } from "vitest";

import { searchCabysCatalog } from "../../src/api/services/cabys.js";

describe("CAByS vía CR API Passport en modo fixture", () => {
  it("consulta el pasaporte sin salir a Internet", async () => {
    const result = await searchCabysCatalog("refrigeracion");
    expect(result.ok).toBe(true);
    expect(result.meta.source === "passport-fixture" || result.meta.source === "fixture").toBe(
      true,
    );
    expect(result.data).toBeTruthy();
  });
});
