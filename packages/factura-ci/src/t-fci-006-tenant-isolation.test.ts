import { afterEach, describe, expect, it } from "vitest";

import { runScenarioSuite } from "./scenarios/runner.js";
import { startSimulator, type SimulatorHandle } from "./simulator/index.js";
import { createCompliantSut } from "./sut-fixtures/index.js";

describe("T-FCI-006 — tenant isolation FC-020..022", () => {
  let sim: SimulatorHandle | undefined;

  afterEach(async () => {
    await sim?.close();
  });

  it("prevents cross-tenant leakage", async () => {
    sim = await startSimulator({ seed: 6 });
    const report = await runScenarioSuite({
      createSut: () => createCompliantSut(sim!.baseUrl),
      simulator: sim,
      seed: 6,
      only: ["FC-020", "FC-021", "FC-022"],
    });
    expect(report.failed).toBe(0);
  });
});