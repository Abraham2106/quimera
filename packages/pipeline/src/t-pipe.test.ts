import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import {
  ERR_ARTIFACT_HASH_MISMATCH,
  ERR_PIPELINE_CONTRACT_MISMATCH,
  ERR_PIPELINE_INVALID_DAG,
  PipelineError,
} from "./errors.js";
import {
  listCheckpoints,
  PIPELINE_EXIT_WAITING_APPROVAL,
  resumePipeline,
  runPipeline,
  validateDagAndContracts,
} from "./index.js";
import {
  baseRegistry,
  buildFourStepDefinition,
  cleanupPipelineRuns,
  ensureTestTenant,
  retryProbeStep,
  testRunContext,
  testSql,
  TEST_TENANT,
} from "./test-helpers.js";

describe.sequential("T-PIPE — motor DAG @quimera/pipeline", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = testSql();
    await ensureTestTenant(sql);
  });

  afterAll(async () => {
    await cleanupPipelineRuns(sql);
    await sql.end({ timeout: 2 });
  });

  beforeEach(async () => {
    await cleanupPipelineRuns(sql);
  });

  it("T-PIPE-001: rechaza ciclo o dependencia inexistente (ERR_PIPELINE_INVALID_DAG)", () => {
    const tracker = new Map<string, number>();
    const registry = baseRegistry(tracker);

    expect(() =>
      validateDagAndContracts(
        {
          pipelineId: "cycle",
          pipelineVersion: "1.0.0",
          steps: [
            {
              id: "a",
              uses: "test.step",
              contractVersion: "^1.0.0",
              idempotent: true,
              dependsOn: ["b"],
            },
            {
              id: "b",
              uses: "test.step",
              contractVersion: "^1.0.0",
              idempotent: true,
              dependsOn: ["a"],
            },
          ],
        },
        registry,
      ),
    ).toThrowError(
      expect.objectContaining({ code: ERR_PIPELINE_INVALID_DAG }),
    );

    expect(() =>
      validateDagAndContracts(
        {
          pipelineId: "missing-dep",
          pipelineVersion: "1.0.0",
          steps: [
            {
              id: "only",
              uses: "test.step",
              contractVersion: "^1.0.0",
              idempotent: true,
              dependsOn: ["ghost"],
            },
          ],
        },
        registry,
      ),
    ).toThrowError(
      expect.objectContaining({ code: ERR_PIPELINE_INVALID_DAG }),
    );
  });

  it("T-PIPE-002: rechaza incompatibilidad SemVer entre productor y consumidor", () => {
    const tracker = new Map<string, number>();
    const registry = {
      ...baseRegistry(tracker),
      "test.step": {
        ...baseRegistry(tracker)["test.step"]!,
        outputContract: {
          name: "quimera.pipeline.test-payload",
          version: "2.0.0",
        },
      },
    };

    expect(() =>
      validateDagAndContracts(
        {
          pipelineId: "semver",
          pipelineVersion: "1.0.0",
          steps: [
            {
              id: "producer",
              uses: "test.step",
              contractVersion: "^1.0.0",
              idempotent: true,
            },
            {
              id: "consumer",
              uses: "test.step",
              contractVersion: "^1.0.0",
              idempotent: true,
              dependsOn: ["producer"],
            },
          ],
        },
        registry,
      ),
    ).toThrowError(
      expect.objectContaining({ code: ERR_PIPELINE_CONTRACT_MISMATCH }),
    );
  });

  it("T-PIPE-003: persiste execution_runs y checkpoints tras cada paso", async () => {
    const tracker = new Map<string, number>();
    const definition = buildFourStepDefinition();
    const registry = baseRegistry(tracker);
    const outcome = await runPipeline(sql, {
      definition,
      registry,
      context: testRunContext(),
    });

    expect(outcome.status).toBe("COMPLETED");
    const checkpoints = await listCheckpoints(sql, outcome.runId);
    expect(checkpoints).toHaveLength(4);
    expect(checkpoints.every((cp) => cp.status === "COMPLETED")).toBe(true);
    expect(checkpoints.map((c) => c.stepId).sort()).toEqual(
      ["step_1", "step_2", "step_3", "step_4"].sort(),
    );
  });

  it("T-PIPE-004: resume tras corte en paso 2 ejecuta solo 3 y 4", async () => {
    const tracker = new Map<string, number>();
    const definition = buildFourStepDefinition();
    const registry = baseRegistry(tracker);
    const ctx = testRunContext();

    const first = await runPipeline(sql, {
      definition,
      registry,
      context: ctx,
      interruptAfterStep: "step_2",
    });
    expect(first.executedSteps).toEqual(["step_1", "step_2"]);
    expect(tracker.get("step_1")).toBe(1);
    expect(tracker.get("step_2")).toBe(1);
    expect(tracker.get("step_3")).toBeUndefined();

    const resumed = await resumePipeline(sql, {
      runId: first.runId,
      definition,
      registry,
      context: ctx,
    });
    expect(resumed.status).toBe("COMPLETED");
    expect(resumed.skippedSteps).toEqual(["step_1", "step_2"]);
    expect(resumed.executedSteps).toEqual(["step_3", "step_4"]);
    expect(tracker.get("step_1")).toBe(1);
    expect(tracker.get("step_2")).toBe(1);
    expect(tracker.get("step_3")).toBe(1);
    expect(tracker.get("step_4")).toBe(1);
    expect(resumed.outputsByStep.step_4).toEqual({ stepId: "step_4", value: "step_4" });
  });

  it("T-PIPE-004b: resume aborta si cambió el hash de entrada", async () => {
    const tracker = new Map<string, number>();
    const definition = buildFourStepDefinition();
    const registry = baseRegistry(tracker);
    const ctx = testRunContext();

    const first = await runPipeline(sql, {
      definition,
      registry,
      context: ctx,
      interruptAfterStep: "step_2",
    });

    const mutated = {
      ...definition,
      steps: definition.steps.map((s) =>
        s.id === "step_2"
          ? { ...s, config: { bumped: true } }
          : s,
      ),
    };

    await expect(
      resumePipeline(sql, {
        runId: first.runId,
        definition: mutated,
        registry,
        context: ctx,
      }),
    ).rejects.toMatchObject({ code: ERR_ARTIFACT_HASH_MISMATCH });
  });

  it("T-PIPE-005: sin reintentos en idempotent:false; con reintentos en idempotent:true", async () => {
    const trackerIdempotent = { attempts: 0 };
    const registryIdempotent = {
      "test.retry_probe": retryProbeStep(trackerIdempotent, true),
    };

    const idempotentDef = {
      pipelineId: "retry-idempotent",
      pipelineVersion: "1.0.0",
      steps: [
        {
          id: "probe",
          uses: "test.retry_probe",
          contractVersion: "^1.0.0",
          idempotent: true,
          retries: { maxAttempts: 3, backoffMs: 1 },
        },
      ],
    };

    const ok = await runPipeline(sql, {
      definition: idempotentDef,
      registry: registryIdempotent,
      context: testRunContext(),
    });
    expect(ok.status).toBe("COMPLETED");
    expect(trackerIdempotent.attempts).toBe(3);

    const trackerNonIdempotent = { attempts: 0 };
    const registryNon = {
      "test.retry_probe": retryProbeStep(trackerNonIdempotent, false),
    };
    const failed = await runPipeline(sql, {
      definition: {
        ...idempotentDef,
        pipelineId: "retry-non-idempotent",
        steps: [{ ...idempotentDef.steps[0]!, idempotent: false }],
      },
      registry: registryNon,
      context: testRunContext(),
    });
    expect(failed.status).toBe("FAILED");
    expect(trackerNonIdempotent.attempts).toBe(1);
  });

  it("T-PIPE-006: compuerta human_review pausa con exit 3 y reanuda", async () => {
    const tracker = new Map<string, number>();
    const registry = baseRegistry(tracker);
    const definition = {
      pipelineId: "human-gate",
      pipelineVersion: "1.0.0",
      steps: [
        {
          id: "prep",
          uses: "test.step",
          contractVersion: "^1.0.0",
          idempotent: true,
        },
        {
          id: "review",
          uses: "pipeline.human_review",
          contractVersion: "^1.0.0",
          idempotent: true,
          dependsOn: ["prep"],
          gate: "human_review" as const,
          config: { blocking: true, blockingCount: 2 },
        },
        {
          id: "after",
          uses: "test.step",
          contractVersion: "^1.0.0",
          idempotent: true,
          dependsOn: ["review"],
        },
      ],
    };

    const paused = await runPipeline(sql, {
      definition,
      registry,
      context: testRunContext(),
    });
    expect(paused.status).toBe("WAITING_FOR_APPROVAL");
    expect(paused.exitCode).toBe(PIPELINE_EXIT_WAITING_APPROVAL);
    expect(tracker.has("after")).toBe(false);

    const resolvedDefinition = {
      ...definition,
      steps: definition.steps.map((s) =>
        s.id === "review"
          ? { ...s, config: { blocking: false } }
          : s,
      ),
    };

    const completed = await resumePipeline(sql, {
      runId: paused.runId,
      definition: resolvedDefinition,
      registry,
      context: testRunContext(),
    });
    expect(completed.status).toBe("COMPLETED");
    expect(tracker.get("after")).toBe(1);
  });

  it("validación estática falla antes de ejecutar el paso 1", async () => {
    const tracker = new Map<string, number>();
    await expect(
      runPipeline(sql, {
        definition: {
          pipelineId: "bad-before-run",
          pipelineVersion: "1.0.0",
          steps: [
            {
              id: "x",
              uses: "test.step",
              contractVersion: "^1.0.0",
              idempotent: true,
              dependsOn: ["missing"],
            },
          ],
        },
        registry: baseRegistry(tracker),
        context: testRunContext(),
      }),
    ).rejects.toBeInstanceOf(PipelineError);

    expect(tracker.size).toBe(0);
  });
});