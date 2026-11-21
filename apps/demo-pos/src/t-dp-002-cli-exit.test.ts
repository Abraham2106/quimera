import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import type { DemoPosCliReport } from "./run-factura-ci.js";
import { DEFAULT_DATABASE_URL } from "./testing/pg-reset.js";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.join(packageRoot, "run-factura-ci.ts");

function runCli(mode: "buggy" | "outbox"): {
  exitCode: number | null;
  report: DemoPosCliReport | undefined;
  stderr: string;
} {
  const tsxBin = path.resolve(packageRoot, "../../../node_modules/.bin/tsx");
  const result = spawnSync(tsxBin, [cliEntry, "--mode", mode], {
    cwd: path.join(packageRoot, ".."),
    env: { ...process.env, DATABASE_URL: DEFAULT_DATABASE_URL },
    encoding: "utf8",
    timeout: 120_000,
  });

  let report: DemoPosCliReport | undefined;
  const stdout = (result.stdout ?? "").trim();
  const jsonLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .at(-1);
  if (jsonLine) {
    try {
      report = JSON.parse(jsonLine) as DemoPosCliReport;
    } catch {
      /* parse in assertions */
    }
  }

  return {
    exitCode: result.status,
    report,
    stderr: (result.stderr ?? "").trim(),
  };
}

describe("AT-17 — demo-pos factura-ci CLI exit codes", () => {
  it(
    "buggy exits 1 with FC-017 and FC-031 failed",
    () => {
      const { exitCode, report } = runCli("buggy");
      expect(exitCode).toBe(1);
      expect(report).toBeDefined();
      expect(report!.mode).toBe("buggy");
      expect(report!.exitCode).toBe(1);
      expect(report!.failedIds).toContain("FC-017");
      expect(report!.failedIds).toContain("FC-031");
    },
    180_000,
  );

  it(
    "outbox exits 0 with 25/25 passed",
    () => {
      const { exitCode, report } = runCli("outbox");
      expect(exitCode).toBe(0);
      expect(report).toBeDefined();
      expect(report!.mode).toBe("outbox");
      expect(report!.exitCode).toBe(0);
      expect(report!.failed).toBe(0);
      expect(report!.total).toBe(25);
      expect(report!.failedIds).toEqual([]);
    },
    180_000,
  );
});