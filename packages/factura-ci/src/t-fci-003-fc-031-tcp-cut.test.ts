import { afterEach, describe, expect, it } from "vitest";

import { runScenarioSuite } from "./scenarios/runner.js";
import { startSimulator, type SimulatorHandle } from "./simulator/index.js";
import { createBuggySut, createCompliantSut } from "./sut-fixtures/index.js";

describe("T-FCI-003 — FC-031 TCP cut after POST", () => {
  let sim: SimulatorHandle | undefined;

  afterEach(async () => {
    await sim?.close();
  });

  it("detects double POST on buggy and reconciles on compliant", async () => {
  for (const kind of ["buggy", "compliant"] as const) {
    const localSim = await startSimulator({ seed: 31 });
    const report = await runScenarioSuite({
      createSut: () =>
        kind === "buggy"
          ? createBuggySut(localSim.baseUrl)
          : createCompliantSut(localSim.baseUrl),
      simulator: localSim,
      seed: 31,
      only: ["FC-031"],
    });
    await localSim.close();
    expect(report.results[0]?.passed).toBe(kind === "compliant");
  }
  }, 15_000);
});