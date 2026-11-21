import { FACTURA_CI_DISCLAIMER } from "../constants.js";
import { SCENARIO_DEFINITIONS } from "./registry.js";
import type { RunSuiteOptions, SuiteRunReport } from "./types.js";
import type { SuiteFilter } from "../constants.js";

function matchesSuite(
  suites: SuiteFilter[],
  filter: SuiteFilter | undefined,
): boolean {
  if (!filter || filter === "all") {
    return true;
  }
  return suites.includes("all") || suites.includes(filter);
}

export async function runScenarioSuite(
  options: RunSuiteOptions,
): Promise<SuiteRunReport> {
  const seed = options.seed ?? 20_261_121;
  const results = [];

  for (const def of SCENARIO_DEFINITIONS) {
    if (options.only && !options.only.includes(def.id)) {
      continue;
    }
    if (!matchesSuite(def.suites, options.suite)) {
      continue;
    }

    options.simulator.clearLog();
    options.simulator.setMode(def.mode);

    let outcome;
    try {
      outcome = await def.run({
        sut: options.createSut(),
        simulator: options.simulator,
        seed,
      });
    } catch (err) {
      outcome = {
        id: def.id,
        passed: false,
        message: err instanceof Error ? err.message : String(err),
        family: def.family,
        suite: def.suites,
      };
    }
    results.push(outcome);
  }

  const failed = results.filter((r) => !r.passed).length;
  return {
    disclaimer: FACTURA_CI_DISCLAIMER,
    seed,
    target: options.simulator.baseUrl,
    results,
    passed: results.length - failed,
    failed,
    exitCode: failed > 0 ? 1 : 0,
  };
}