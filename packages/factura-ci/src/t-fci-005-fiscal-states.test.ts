import { afterEach, describe, expect, it } from "vitest";

import { runScenarioSuite } from "./scenarios/runner.js";
import { startSimulator, type SimulatorHandle } from "./simulator/index.js";
import { createCompliantSut } from "./sut-fixtures/index.js";

describe("T-FCI-005 — fiscal states FC-005..008", () => {
  let sim: SimulatorHandle | undefined;

  afterEach(async () => {
    await sim?.close();
  });

  it("classifies processing, rechazado, 503 and 409 paths", async () => {
    sim = await startSimulator({ seed: 5 });
    const report = await runScenarioSuite({
      createSut: () => createCompliantSut(sim!.baseUrl),
      simulator: sim,
      seed: 5,
      only: ["FC-005", "FC-006", "FC-007", "FC-008"],
    });
    expect(report.failed).toBe(0);
  });
});