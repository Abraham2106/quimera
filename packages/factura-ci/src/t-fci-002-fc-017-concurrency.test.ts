import { afterEach, describe, expect, it } from "vitest";

import { runScenarioSuite } from "./scenarios/runner.js";
import { startSimulator, type SimulatorHandle } from "./simulator/index.js";
import { createBuggySut, createCompliantSut } from "./sut-fixtures/index.js";

describe("T-FCI-002 — FC-017 concurrency", () => {
  let sim: SimulatorHandle | undefined;

  afterEach(async () => {
    await sim?.close();
  });

  it("fails on buggy fixture and passes on compliant", async () => {
    sim = await startSimulator({ seed: 99 });

    const buggyReport = await runScenarioSuite({
      createSut: () => createBuggySut(sim!.baseUrl),
      simulator: sim,
      seed: 99,
      only: ["FC-017"],
    });
    expect(buggyReport.results[0]?.passed).toBe(false);

    const compliantReport = await runScenarioSuite({
      createSut: () => createCompliantSut(sim!.baseUrl),
      simulator: sim,
      seed: 99,
      only: ["FC-017"],
    });
    expect(compliantReport.results[0]?.passed).toBe(true);
  });
});