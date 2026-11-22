import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { runScenarioSuite, startSimulator } from "@quimera/factura-ci";
import type { Sql } from "postgres";

import { createDemoPosSut, type DemoPosMode } from "./sut-factory.js";
import { DEFAULT_DATABASE_URL, resetDemoPosDatabase } from "./testing/pg-reset.js";

const DEFAULT_SEED = 20_261_121;

export interface DemoPosCliReport {
  mode: DemoPosMode;
  passed: number;
  failed: number;
  total: number;
  exitCode: number;
  failedIds: string[];
}

export async function runDemoPosFacturaCi(
  mode: DemoPosMode,
  seed = DEFAULT_SEED,
): Promise<DemoPosCliReport> {
  const simulator = await startSimulator({ host: "127.0.0.1", port: 0, seed });

  let db: Sql | undefined;
  try {
    if (mode === "outbox") {
      const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
      db = await resetDemoPosDatabase(connectionString);
    }

    const report = await runScenarioSuite({
      createSut: () => createDemoPosSut(mode, simulator.baseUrl, db),
      simulator,
      seed,
    });

    const failedIds = report.results.filter((r) => !r.passed).map((r) => r.id);

    return {
      mode,
      passed: report.passed,
      failed: report.failed,
      total: report.results.length,
      exitCode: report.exitCode,
      failedIds,
    };
  } finally {
    await simulator.close();
    if (db) {
      await db.end({ timeout: 5 });
    }
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      mode: { type: "string" },
      seed: { type: "string" },
    },
    allowPositionals: false,
  });

  const modeRaw = values.mode;
  if (modeRaw !== "buggy" && modeRaw !== "outbox") {
    process.stderr.write("Usage: factura-ci --mode buggy|outbox [--seed N]\n");
    process.exit(2);
  }

  const seed = values.seed ? Number(values.seed) : DEFAULT_SEED;
  const report = await runDemoPosFacturaCi(modeRaw, seed);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.exitCode);
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}