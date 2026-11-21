import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import {
  runScenarioSuite,
  startSimulator,
  type SimulatorHandle,
} from "@quimera/factura-ci";

import { createDemoPosSut } from "./sut-factory.js";
import { DEFAULT_DATABASE_URL, resetDemoPosDatabase } from "./testing/pg-reset.js";

describe("AT-16 — demo-pos buggy vs outbox", () => {
  let sim: SimulatorHandle | undefined;
  let db: Sql | undefined;

  afterEach(async () => {
    await sim?.close();
    if (db) {
      await db.end({ timeout: 5 });
      db = undefined;
    }
  });

  beforeAll(() => {
    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  });

  it("buggy fails FC-017 (duplicate consecutivos under concurrency)", async () => {
    sim = await startSimulator({ seed: 99, host: "127.0.0.1", port: 0 });
    const report = await runScenarioSuite({
      createSut: () => createDemoPosSut("buggy", sim!.baseUrl),
      simulator: sim,
      seed: 99,
      only: ["FC-017"],
    });
    expect(report.results[0]?.passed).toBe(false);
  });

  it("outbox passes FC-017", async () => {
    sim = await startSimulator({ seed: 99, host: "127.0.0.1", port: 0 });
    db = await resetDemoPosDatabase();
    const report = await runScenarioSuite({
      createSut: () => createDemoPosSut("outbox", sim!.baseUrl, db!),
      simulator: sim,
      seed: 99,
      only: ["FC-017"],
    });
    expect(report.results[0]?.passed).toBe(true);
  });

  it("buggy fails FC-031 (second POST after TCP cut)", async () => {
    sim = await startSimulator({ seed: 31, host: "127.0.0.1", port: 0 });
    const report = await runScenarioSuite({
      createSut: () => createDemoPosSut("buggy", sim!.baseUrl),
      simulator: sim,
      seed: 31,
      only: ["FC-031"],
    });
    expect(report.results[0]?.passed).toBe(false);
  }, 15_000);

  it("outbox passes FC-031 (single POST, reconcile via GET)", async () => {
    sim = await startSimulator({ seed: 31, host: "127.0.0.1", port: 0 });
    db = await resetDemoPosDatabase();
    const report = await runScenarioSuite({
      createSut: () => createDemoPosSut("outbox", sim!.baseUrl, db!),
      simulator: sim,
      seed: 31,
      only: ["FC-031"],
    });
    expect(report.results[0]?.passed).toBe(true);
  }, 15_000);
});