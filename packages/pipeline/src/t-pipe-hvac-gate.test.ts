import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import {
  loadDemoHvac1000,
  resolveDemoHvacFixtureRoot,
} from "@quimera/data-exodus";

import {
  PIPELINE_EXIT_WAITING_APPROVAL,
  resumePipeline,
  runPipeline,
} from "./index.js";
import {
  cleanupPipelineRuns,
  ensureTestTenant,
  testHumanDecision,
  testRunContext,
  testSql,
} from "./test-helpers.js";
import type { StepRegistryEntry } from "./types.js";

const CONTRACT = {
  name: "quimera.pipeline.test-payload",
  version: "1.2.0",
} as const;

describe.sequential("T-PIPE — demo-hvac-1000 pausa el pipeline", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = testSql();
    await ensureTestTenant(sql);
  });

  afterAll(async () => {
    await cleanupPipelineRuns(sql);
    await sql.end({ timeout: 2 });
  });

  it("exit 3 mientras hay conflictos bloqueantes y reanuda tras la decisión", async () => {
    const loaded = await loadDemoHvac1000(resolveDemoHvacFixtureRoot(import.meta.url));
    const blocking = loaded.reconcile.conflicts.filter(
      (c) => c.severity === "BLOCKING" && !c.autoResolved,
    );
    expect(blocking.length).toBeGreaterThan(0);
    expect(loaded.reconcile.countsByCode.PROBABLE_DUPLICATE).toBe(40);
    expect(loaded.reconcile.countsByCode.CONFLICTING_IDENTITY).toBe(3);
    expect(loaded.reconcile.countsByCode.INVALID_REFERENCE).toBe(7);
    expect(loaded.reconcile.countsByCode.UNRECONCILABLE_BALANCE).toBe(1);

    const gate: StepRegistryEntry = {
      uses: "data-exodus.review",
      implementationVersion: "1.0.0",
      inputContract: { ...CONTRACT, version: "1.0.0" },
      outputContract: { ...CONTRACT },
      idempotent: true,
      execute: async (_ctx, request) => {
        if (request.config["resolved"] !== true) {
          return { kind: "waiting_approval", blockingCount: blocking.length };
        }
        return { kind: "success", output: { migrated: true, blockingCount: 0 } };
      },
    };

    const definition = {
      pipelineId: "demo-hvac-1000",
      pipelineVersion: "1.0.0",
      steps: [
        {
          id: "review",
          uses: "data-exodus.review",
          contractVersion: "^1.0.0",
          idempotent: true,
          gate: "human_review" as const,
          config: { resolved: false },
        },
      ],
    };

    const paused = await runPipeline(sql, {
      definition,
      registry: { "data-exodus.review": gate },
      context: testRunContext(),
    });
    expect(paused.exitCode).toBe(PIPELINE_EXIT_WAITING_APPROVAL);
    expect(paused.exitCode).toBe(3);
    expect(paused.status).toBe("WAITING_FOR_APPROVAL");

    const completed = await resumePipeline(sql, {
      runId: paused.runId,
      definition: {
        ...definition,
        steps: [{ ...definition.steps[0]!, config: { resolved: true } }],
      },
      registry: { "data-exodus.review": gate },
      context: testRunContext(),
      humanDecision: testHumanDecision("reviewer@demo.cr"),
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.exitCode).toBe(0);
  });
});
