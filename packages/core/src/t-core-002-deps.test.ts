import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("T-CORE-002 — dependencias runtime aisladas", () => {
  it("solo declara zod en dependencies", async () => {
    const pkgPath = join(here, "../package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(["zod"]);
  });

  it("importa el paquete sin dependencias prohibidas", async () => {
    const mod = await import("./index.js");
    expect(mod.QuimeraErrorSchema).toBeDefined();
    expect(mod.parseCrMoney).toBeTypeOf("function");
  });
});