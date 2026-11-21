import { afterEach, describe, expect, it } from "vitest";

import { runScenarioSuite } from "./scenarios/runner.js";
import { startSimulator, type SimulatorHandle } from "./simulator/index.js";
import { createCompliantSut } from "./sut-fixtures/index.js";

describe("T-FCI-004 — idempotency FC-009", () => {
  let sim: SimulatorHandle | undefined;

  afterEach(async () => {
    await sim?.close();
  });

  it("five duplicate events produce exactly one POST", async () => {
    sim = await startSimulator({ seed: 4 });
    const report = await runScenarioSuite({
      createSut: () => createCompliantSut(sim!.baseUrl),
      simulator: sim,
      seed: 4,
      only: ["FC-009"],
    });
    expect(report.results[0]?.passed).toBe(true);
  });
});