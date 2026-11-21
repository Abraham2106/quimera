import { afterEach, describe, expect, it } from "vitest";

import { runScenarioSuite } from "./scenarios/runner.js";
import { startSimulator, type SimulatorHandle } from "./simulator/index.js";
import { createCompliantSut } from "./sut-fixtures/index.js";

describe("T-FCI-007 — restart and corrections", () => {
  let sim: SimulatorHandle | undefined;

  afterEach(async () => {
    await sim?.close();
  });

  it("recovers after restart and rejects mutation", async () => {
    sim = await startSimulator({ seed: 7 });
    const report = await runScenarioSuite({
      createSut: () => createCompliantSut(sim!.baseUrl),
      simulator: sim,
      seed: 7,
      only: ["FC-012", "FC-023", "FC-024"],
    });
    expect(report.failed).toBe(0);
  });
});