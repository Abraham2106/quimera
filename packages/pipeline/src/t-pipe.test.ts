import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import {
  ERR_ARTIFACT_HASH_MISMATCH,
  ERR_PIPELINE_CONTRACT_MISMATCH,
  ERR_PIPELINE_INVALID_DAG,
  ERR_PIPELINE_INVALID_RETRIES,
  ERR_PIPELINE_INVALID_STATE,
  ERR_PIPELINE_RUN_MISMATCH,
  ERR_PIPELINE_RUN_NOT_FOUND,
  PipelineError,
} from "./errors.js";
import {
  getExecutionRun,
  listCheckpoints,
  parsePipelineJson,
  PIPELINE_EXIT_WAITING_APPROVAL,
  recordHumanDecision,
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
  testHumanDecision,
  testRunContext,
  testSql,
  TEST_TENANT,
  TEST_TENANT_B,
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
    const checkpoints = await listCheckpoints(sql, TEST_TENANT, outcome.runId);
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
      humanDecision: testHumanDecision(),
    });
    expect(completed.status).toBe("COMPLETED");
    expect(tracker.get("after")).toBe(1);

    const checkpoints = await listCheckpoints(sql, TEST_TENANT, paused.runId);
    const gate = checkpoints.find((cp) => cp.stepId === "review");
    expect(gate?.decisionJson).toMatchObject({ actorId: "operator@demo.cr" });
    expect(gate?.decisionConsumedAt).not.toBeNull();
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

  function gateDefinition(pipelineId: string, resolved: boolean) {
    return {
      pipelineId,
      pipelineVersion: "1.0.0",
      steps: [
        {
          id: "review",
          uses: "pipeline.human_review",
          contractVersion: "^1.0.0",
          idempotent: true,
          gate: "human_review" as const,
          config: { blocking: !resolved },
        },
      ],
    };
  }

  it("T-PIPE-007: resume no re-ejecuta la compuerta sin decisión humana persistida", async () => {
    const tracker = new Map<string, number>();
    const registry = baseRegistry(tracker);
    const paused = await runPipeline(sql, {
      definition: gateDefinition("gate-no-decision", false),
      registry,
      context: testRunContext(),
    });
    expect(paused.status).toBe("WAITING_FOR_APPROVAL");
    expect(tracker.get("review")).toBe(1);

    const withoutDecision = await resumePipeline(sql, {
      runId: paused.runId,
      definition: gateDefinition("gate-no-decision", true),
      registry,
      context: testRunContext(),
    });
    expect(withoutDecision.status).toBe("WAITING_FOR_APPROVAL");
    expect(tracker.get("review")).toBe(1);

    const saved = await recordHumanDecision(sql, {
      tenantId: TEST_TENANT,
      runId: paused.runId,
      stepId: "review",
      decision: testHumanDecision(),
    });
    expect(saved).toBe(true);

    const completed = await resumePipeline(sql, {
      runId: paused.runId,
      definition: gateDefinition("gate-no-decision", true),
      registry,
      context: testRunContext(),
    });
    expect(completed.status).toBe("COMPLETED");
    expect(tracker.get("review")).toBe(2);
  });

  it("T-PIPE-008: resume valida tenant, pipeline y estado del run", async () => {
    const definition = buildFourStepDefinition();
    const registry = baseRegistry(new Map<string, number>());
    const running = await runPipeline(sql, {
      definition,
      registry,
      context: testRunContext(),
      interruptAfterStep: "step_1",
    });

    await expect(
      resumePipeline(sql, {
        runId: running.runId,
        definition,
        registry,
        context: testRunContext(TEST_TENANT_B),
      }),
    ).rejects.toMatchObject({ code: ERR_PIPELINE_RUN_NOT_FOUND });

    await expect(
      resumePipeline(sql, {
        runId: running.runId,
        definition: { ...definition, pipelineId: "otro-pipeline" },
        registry,
        context: testRunContext(),
      }),
    ).rejects.toMatchObject({ code: ERR_PIPELINE_RUN_MISMATCH });

    const completed = await runPipeline(sql, {
      definition,
      registry: baseRegistry(new Map<string, number>()),
      context: testRunContext(),
    });
    expect(completed.status).toBe("COMPLETED");
    await expect(
      resumePipeline(sql, {
        runId: completed.runId,
        definition,
        registry,
        context: testRunContext(),
      }),
    ).rejects.toMatchObject({ code: ERR_PIPELINE_INVALID_STATE });
  });

  it("T-PIPE-009: attemptCount refleja los reintentos reales del paso", async () => {
    const tracker = { attempts: 0 };
    const outcome = await runPipeline(sql, {
      definition: {
        pipelineId: "retry-attempt-count",
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
      },
      registry: { "test.retry_probe": retryProbeStep(tracker, true) },
      context: testRunContext(),
    });
    expect(outcome.status).toBe("COMPLETED");
    expect(tracker.attempts).toBe(3);
    const checkpoints = await listCheckpoints(sql, TEST_TENANT, outcome.runId);
    expect(checkpoints[0]?.attemptCount).toBe(3);
  });

  it("T-PIPE-010: validación Zod de maxAttempts y backoffMs", () => {
    const base = {
      pipelineId: "retries-zod",
      pipelineVersion: "1.0.0",
      steps: [{ id: "step", uses: "test.step", idempotent: true }],
    };
    expect(() =>
      parsePipelineJson(
        JSON.stringify({
          ...base,
          steps: [{ ...base.steps[0], retries: { maxAttempts: 0 } }],
        }),
      ),
    ).toThrow(/invalid retries/i);
    expect(() =>
      parsePipelineJson(
        JSON.stringify({
          ...base,
          steps: [{ ...base.steps[0], retries: { backoffMs: -1 } }],
        }),
      ),
    ).toThrow(/invalid retries/i);
    const parsed = parsePipelineJson(
      JSON.stringify({
        ...base,
        steps: [{ ...base.steps[0], retries: { maxAttempts: 3, backoffMs: 5 } }],
      }),
    );
    expect(parsed.steps[0]?.retries).toEqual({ maxAttempts: 3, backoffMs: 5 });
  });

  it("T-PIPE-010b: rechaza reintentos inválidos antes de ejecutar el paso", async () => {
    const tracker = new Map<string, number>();
    await expect(
      runPipeline(sql, {
        definition: {
          pipelineId: "retries-invalid-runtime",
          pipelineVersion: "1.0.0",
          steps: [
            {
              id: "step_1",
              uses: "test.step",
              contractVersion: "^1.0.0",
              idempotent: true,
              retries: { maxAttempts: 0, backoffMs: 0 },
            },
          ],
        },
        registry: baseRegistry(tracker),
        context: testRunContext(),
      }),
    ).rejects.toMatchObject({ code: ERR_PIPELINE_INVALID_RETRIES });
    expect(tracker.size).toBe(0);
  });

  it("T-PIPE-011: RLS aísla qum_checkpoints entre tenants", async () => {
    const rls = await sql<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >`
      SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class WHERE relname = 'qum_checkpoints'
    `;
    expect(rls[0]?.relrowsecurity).toBe(true);
    expect(rls[0]?.relforcerowsecurity).toBe(true);

    const outcome = await runPipeline(sql, {
      definition: buildFourStepDefinition(),
      registry: baseRegistry(new Map<string, number>()),
      context: testRunContext(TEST_TENANT_B),
      interruptAfterStep: "step_1",
    });
    expect(await listCheckpoints(sql, TEST_TENANT, outcome.runId)).toEqual([]);
    expect((await listCheckpoints(sql, TEST_TENANT_B, outcome.runId)).length).toBe(1);
  });

  it("T-PIPE-012: checkpoint y estado del run quedan consistentes tras un fallo", async () => {
    const failing = baseRegistry(new Map<string, number>());
    const outcome = await runPipeline(sql, {
      definition: {
        pipelineId: "failed-step",
        pipelineVersion: "1.0.0",
        steps: [
          {
            id: "step_1",
            uses: "test.fail",
            contractVersion: "^1.0.0",
            idempotent: false,
          },
        ],
      },
      registry: {
        ...failing,
        "test.fail": {
          ...failing["test.step"]!,
          uses: "test.fail",
          execute: async () => ({
            kind: "failure" as const,
            retryable: false,
            message: "boom",
          }),
        },
      },
      context: testRunContext(),
    });
    expect(outcome.status).toBe("FAILED");
    const checkpoints = await listCheckpoints(sql, TEST_TENANT, outcome.runId);
    expect(checkpoints[0]?.status).toBe("FAILED");
    const run = await getExecutionRun(sql, TEST_TENANT, outcome.runId);
    expect(run?.status).toBe("FAILED");
  });
});