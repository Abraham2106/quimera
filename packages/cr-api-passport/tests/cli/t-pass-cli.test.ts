import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../../src/cli.js";
import { getCapabilities } from "../../src/capabilities.js";

describe("CLI quimera-passport", () => {
  it("getCapabilities y --capabilities --json", async () => {
    const caps = getCapabilities();
    expect(caps.cli.binary).toBe("quimera-passport");
    const res = await runCli(["--capabilities", "--json"]);
    expect(res.exitCode).toBe(0);
    expect(res.payload).toMatchObject({ module: "@quimera/cr-api-passport" });
  });

  it("generate escribe adaptador y test en --out", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "quimera-pass-"));
    try {
      const res = await runCli([
        "generate",
        "cr.hacienda.cabys",
        "--out",
        dir,
        "--json",
      ]);
      expect(res.exitCode).toBe(0);
      const payload = res.payload as { adapterPath: string; testPath: string };
      const adapter = await readFile(payload.adapterPath, "utf8");
      expect(adapter).toContain("cr.hacienda.cabys");
      const test = await readFile(payload.testPath, "utf8");
      expect(test).toContain("vitest");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});