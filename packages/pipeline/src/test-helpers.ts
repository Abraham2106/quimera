import {
  FixedClock,
  InMemoryArtifactStore,
  MemoryLogger,
} from "@quimera/core";
import type { Sql } from "postgres";

import { createPipelineSql } from "./store/postgres.js";
import type { RunContext, StepRegistry, StepRegistryEntry } from "./types.js";

export const TEST_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const TEST_TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export function testSql(): Sql {
  return createPipelineSql();
}

export async function ensureTestTenant(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO qum_tenants (id, slug, display_name)
    VALUES
      (${TEST_TENANT}, ${"pipeline-test"}, ${"Pipeline Test Tenant"}),
      (${TEST_TENANT_B}, ${"pipeline-test-b"}, ${"Pipeline Test Tenant B"})
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function cleanupPipelineRuns(sql: Sql): Promise<void> {
  for (const tenantId of [TEST_TENANT, TEST_TENANT_B]) {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await tx`
        DELETE FROM qum_checkpoints cp
        USING qum_execution_runs er
        WHERE cp.run_id = er.id AND er.tenant_id = ${tenantId}::uuid
      `;
      await tx`DELETE FROM qum_execution_runs WHERE tenant_id = ${tenantId}::uuid`;
    });
  }
}

export function testRunContext(tenantId = TEST_TENANT): RunContext {
  return {
    tenantId,
    correlationId: "test-correlation",
    stepContext: {
      tenantId,
      correlationId: "test-correlation",
      clock: new FixedClock(new Date("2026-01-01T00:00:00.000Z")),
      logger: new MemoryLogger(),
      artifacts: new InMemoryArtifactStore(),
    },
  };
}

export function testHumanDecision(actorId = "operator@demo.cr") {
  return {
    actorId,
    action: "APPROVE",
    rationale: "Conflictos revisados y aprobados manualmente",
  };
}

const CONTRACT = {
  name: "quimera.pipeline.test-payload",
  version: "1.2.0",
} as const;

export function counterStep(
  uses: string,
  tracker: Map<string, number>,
  outputSuffix = "",
): StepRegistryEntry {
  return {
    uses,
    implementationVersion: "1.0.0",
    inputContract: { ...CONTRACT, version: "1.0.0" },
    outputContract: { ...CONTRACT },
    idempotent: true,
    execute: async (_ctx, request) => {
      tracker.set(request.stepId, (tracker.get(request.stepId) ?? 0) + 1);
      if (request.isHumanGate && request.config["blocking"] === true) {
        return {
          kind: "waiting_approval",
          blockingCount: Number(request.config["blockingCount"] ?? 1),
        };
      }
      return {
        kind: "success",
        output: { stepId: request.stepId, value: `${request.stepId}${outputSuffix}` },
      };
    },
  };
}

export function retryProbeStep(
  tracker: { attempts: number },
  idempotent: boolean,
): StepRegistryEntry {
  return {
    uses: "test.retry_probe",
    implementationVersion: "1.0.0",
    inputContract: { ...CONTRACT, version: "1.0.0" },
    outputContract: { ...CONTRACT },
    idempotent,
    execute: async () => {
      tracker.attempts += 1;
      if (tracker.attempts < 3) {
        return {
          kind: "failure",
          retryable: true,
          message: "transient",
        };
      }
      return { kind: "success", output: { ok: true } };
    },
  };
}

export function buildFourStepDefinition() {
  return {
    pipelineId: "test-four-step",
    pipelineVersion: "1.0.0",
    steps: [
      {
        id: "step_1",
        uses: "test.step",
        contractVersion: "^1.0.0",
        idempotent: true,
      },
      {
        id: "step_2",
        uses: "test.step",
        contractVersion: "^1.0.0",
        idempotent: true,
        dependsOn: ["step_1"],
      },
      {
        id: "step_3",
        uses: "test.step",
        contractVersion: "^1.0.0",
        idempotent: true,
        dependsOn: ["step_2"],
      },
      {
        id: "step_4",
        uses: "test.step",
        contractVersion: "^1.0.0",
        idempotent: true,
        dependsOn: ["step_3"],
      },
    ],
  } as const;
}

export function baseRegistry(tracker: Map<string, number>): StepRegistry {
  return {
    "test.step": counterStep("test.step", tracker),
    "pipeline.human_review": counterStep("pipeline.human_review", tracker),
    "test.retry_probe": retryProbeStep({ attempts: 0 }, true),
  };
}