import { describe, expect, it } from "vitest";

import { FACTURA_CI_DISCLAIMER } from "./constants.js";
import { runFacturaCiCli } from "./cli.js";
import { formatJsonReport } from "./reporters/json.js";
import { formatPrettyReport } from "./reporters/pretty.js";
import { runScenarioSuite } from "./scenarios/runner.js";
import { startSimulator, type SimulatorHandle } from "./simulator/index.js";
import { createCompliantSut } from "./sut-fixtures/index.js";

describe("T-FCI-008 — CLI outputs and exit codes", () => {
  let sim: SimulatorHandle | undefined;

  it("json and pretty include disclaimer", async () => {
    sim = await startSimulator({ seed: 8 });
    const report = await runScenarioSuite({
      createSut: () => createCompliantSut(sim!.baseUrl),
      simulator: sim,
      seed: 8,
      only: ["FC-001"],
    });
    const json = formatJsonReport(report);
    const pretty = formatPrettyReport(report);
    expect(json).toContain("disclaimer");
    expect(json).toContain(FACTURA_CI_DISCLAIMER);
    expect(pretty).toContain(FACTURA_CI_DISCLAIMER);
    await sim?.close();
    sim = undefined;
  });

  it("run CLI returns exit 0 for compliant full suite", async () => {
    const code = await runFacturaCiCli({
      target: "fixture:compliant",
      seed: 8,
      format: "json",
    });
    expect(code).toBe(0);
  });

  it("run CLI returns exit 2 for unknown target host", async () => {
    const code = await runFacturaCiCli({
      target: "http://203.0.113.9:9",
      seed: 8,
    });
    expect(code).toBe(2);
  }, 15_000);
});