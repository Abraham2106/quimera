#!/usr/bin/env node
import { parseArgs } from "node:util";
import fs from "node:fs/promises";

import { ERR_SUT_UNREACHABLE, FACTURA_CI_DISCLAIMER } from "./constants.js";
import { FacturaCiError } from "./errors.js";
import { formatJsonReport } from "./reporters/json.js";
import { formatJunitReport } from "./reporters/junit.js";
import { formatPrettyReport } from "./reporters/pretty.js";
import { listScenarios } from "./scenarios/registry.js";
import { runScenarioSuite } from "./scenarios/runner.js";
import type { SuiteFilter } from "./constants.js";
import { startSimulator, parseTargetUrl } from "./simulator/index.js";
import { createBuggySut, createCompliantSut } from "./sut-fixtures/index.js";
import type { FiscalSut } from "./types/fiscal-sut.js";
import { loopbackRequest } from "./sut-fixtures/http.js";

export type OutputFormat = "pretty" | "json" | "junit";

export interface CliRunOptions {
  target: string;
  suite?: SuiteFilter;
  seed?: number;
  format?: OutputFormat;
  out?: string;
}

export async function resolveSut(target: string, simulatorUrl: string): Promise<FiscalSut> {
  if (target === "fixture:compliant" || target === "fixture:buggy") {
    return target === "fixture:buggy"
      ? createBuggySut(simulatorUrl)
      : createCompliantSut(simulatorUrl);
  }

  parseTargetUrl(target);
  const health = await loopbackRequest("GET", `${target.replace(/\/$/, "")}/health`);
  if (health.networkError || health.status === 404) {
    throw new FacturaCiError(
      ERR_SUT_UNREACHABLE,
      `SUT at ${target} is unreachable (HTTP adapters require fixture:compliant|fixture:buggy in this package).`,
    );
  }
  throw new FacturaCiError(
    ERR_SUT_UNREACHABLE,
    `External HTTP SUT adapter not configured; use fixture:compliant or fixture:buggy.`,
  );
}

export async function runFacturaCiCli(options: CliRunOptions): Promise<number> {
  const seed = options.seed ?? 20_261_121;
  const format = options.format ?? "pretty";

  const simulator = await startSimulator({ host: "127.0.0.1", port: 0, seed });

  try {
    const sutTarget =
      options.target.startsWith("fixture:")
        ? options.target
        : options.target;
    await resolveSut(sutTarget, simulator.baseUrl);

    const report = await runScenarioSuite({
      createSut: () =>
        sutTarget === "fixture:buggy"
          ? createBuggySut(simulator.baseUrl)
          : createCompliantSut(simulator.baseUrl),
      simulator,
      seed,
      suite: options.suite,
    });

    const output =
      format === "json"
        ? formatJsonReport(report)
        : format === "junit"
          ? formatJunitReport(report)
          : formatPrettyReport(report);

    if (options.out) {
      await fs.writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(`${output}\n`);
    }

    return report.exitCode;
  } catch (err) {
    const message =
      err instanceof FacturaCiError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    process.stderr.write(`${message}\n${FACTURA_CI_DISCLAIMER}\n`);
    return 2;
  } finally {
    await simulator.close();
  }
}

export function printScenarioList(json: boolean): void {
  const ids = listScenarios();
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ disclaimer: FACTURA_CI_DISCLAIMER, scenarios: ids }, null, 2)}\n`,
    );
    return;
  }
  process.stdout.write(`${FACTURA_CI_DISCLAIMER}\n\n`);
  for (const id of ids) {
    process.stdout.write(`${id}\n`);
  }
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  if (raw.length === 0 || raw[0] === "--help" || raw[0] === "-h") {
    process.stdout.write(
      `quimera-factura-ci — synthetic fiscal behavioral tests\n\n` +
        `Commands:\n` +
        `  run --target <url|fixture:compliant|fixture:buggy> [--suite all] [--seed N] [--format pretty|json|junit] [--out file]\n` +
        `  list [--json]\n\n` +
        `${FACTURA_CI_DISCLAIMER}\n`,
    );
    process.exit(0);
  }

  const command = raw[0];
  if (command === "list") {
    printScenarioList(raw.includes("--json"));
    process.exit(0);
  }

  if (command !== "run") {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exit(2);
  }

  const { values } = parseArgs({
    args: raw.slice(1),
    options: {
      target: { type: "string" },
      suite: { type: "string" },
      seed: { type: "string" },
      format: { type: "string" },
      out: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.target) {
    process.stderr.write("Missing required --target\n");
    process.exit(2);
  }

  const code = await runFacturaCiCli({
    target: values.target,
    suite: values.suite as SuiteFilter | undefined,
    seed: values.seed ? Number(values.seed) : undefined,
    format: (values.format as OutputFormat | undefined) ?? "pretty",
    out: values.out,
  });
  process.exit(code);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  process.argv[1]?.endsWith("/cli.ts") ||
  process.argv[1]?.endsWith("/quimera-factura-ci.mjs");

if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(String(err));
    process.exit(2);
  });
}