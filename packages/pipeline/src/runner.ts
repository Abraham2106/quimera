import type { Sql } from "postgres";

import {
  ERR_ARTIFACT_HASH_MISMATCH,
  ERR_PIPELINE_INVALID_DAG,
  isPipelineError,
  PipelineError,
} from "./errors.js";
import { computeStepInputHash } from "./input-hash.js";
import { validateDagAndContracts } from "./contracts.js";
import {
  createExecutionRun,
  listCheckpoints,
  updateExecutionRunStatus,
  upsertCheckpoint,
} from "./store/postgres.js";
import type {
  CheckpointRecord,
  PipelineDefinition,
  PipelineExecutionResult,
  PipelineStepDef,
  ResumePipelineOptions,
  RunPipelineOptions,
  StepExecuteResult,
  StepExecutionRequest,
  StepRegistry,
} from "./types.js";
import {
  PIPELINE_EXIT_ERROR,
  PIPELINE_EXIT_SUCCESS,
  PIPELINE_EXIT_WAITING_APPROVAL,
} from "./types.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkpointsByStep(
  checkpoints: readonly CheckpointRecord[],
): Map<string, CheckpointRecord> {
  return new Map(checkpoints.map((cp) => [cp.stepId, cp]));
}

function registryEntry(registry: StepRegistry, step: PipelineStepDef) {
  const entry = registry[step.uses];
  if (!entry) {
    throw new PipelineError(
      ERR_PIPELINE_INVALID_DAG,
      `Unknown step implementation "${step.uses}" for "${step.id}"`,
    );
  }
  return entry;
}

async function executeWithRetry(
  step: PipelineStepDef,
  entry: ReturnType<typeof registryEntry>,
  _ctx: RunPipelineOptions["context"],
  request: StepExecutionRequest,
): Promise<StepExecuteResult> {
  const maxAttempts =
    step.retries?.maxAttempts ?? (step.idempotent ? DEFAULT_MAX_ATTEMPTS : 1);
  const backoffMs = step.retries?.backoffMs ?? DEFAULT_BACKOFF_MS;
  let last: StepExecuteResult = {
    kind: "failure",
    retryable: false,
    message: "no attempts",
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await entry.execute(_ctx.stepContext, {
      ...request,
      isHumanGate: step.gate === "human_review" || step.uses === "pipeline.human_review",
    });
    if (result.kind !== "failure") {
      return result;
    }
    last = result;
    const allowRetry = step.idempotent && result.retryable && attempt < maxAttempts;
    if (!allowRetry) {
      return result;
    }
    await sleep(backoffMs * attempt);
  }
  return last;
}

export interface ExecutePipelineParams {
  readonly sql: Sql;
  readonly options: RunPipelineOptions;
  readonly existingRunId?: string;
  readonly resume?: boolean;
}

export async function executePipeline(
  params: ExecutePipelineParams,
): Promise<PipelineExecutionResult> {
  const { sql, options, existingRunId, resume = false } = params;
  const { definition, registry, context } = options;
  const order = validateDagAndContracts(definition, registry);
  const stepById = new Map(definition.steps.map((s) => [s.id, s]));

  let runId = existingRunId;
  if (!runId) {
    const run = await createExecutionRun(sql, {
      tenantId: context.tenantId,
      pipelineId: definition.pipelineId,
      pipelineVersion: definition.pipelineVersion,
    });
    runId = run.id;
  }

  const priorCheckpoints = runId
    ? await listCheckpoints(sql, runId)
    : [];
  const checkpointMap = checkpointsByStep(priorCheckpoints);

  const outputsByStep: Record<string, unknown> = {};
  const executedSteps: string[] = [];
  const skippedSteps: string[] = [];

  for (const cp of priorCheckpoints) {
    if (cp.status === "COMPLETED" && cp.outputRef !== null && cp.outputRef !== undefined) {
      outputsByStep[cp.stepId] = cp.outputRef;
    }
  }

  try {
    for (const stepId of order) {
      const step = stepById.get(stepId);
      if (!step) continue;

      const inputHash = computeStepInputHash(step, outputsByStep);
      const existing = checkpointMap.get(stepId);

      if (resume && existing?.status === "COMPLETED") {
        if (existing.inputHash !== inputHash) {
          throw new PipelineError(
            ERR_ARTIFACT_HASH_MISMATCH,
            `Input hash for step "${stepId}" changed since checkpoint; aborting resume`,
          );
        }
        skippedSteps.push(stepId);
        continue;
      }

      if (resume && existing?.status === "WAITING_FOR_APPROVAL") {
        // Re-execute human gate after approval (tests simulate resolution by config)
      }

      const entry = registryEntry(registry, step);
      await upsertCheckpoint(sql, {
        runId,
        stepId,
        status: "RUNNING",
        inputHash,
        outputRef: null,
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        checkpointId: existing?.id,
      });

      const result = await executeWithRetry(step, entry, context, {
        stepId: step.id,
        config: step.config ?? {},
        upstreamOutputs: outputsByStep,
        isHumanGate:
          step.gate === "human_review" || step.uses === "pipeline.human_review",
      });

      if (result.kind === "waiting_approval") {
        const out = result.output ?? {
          blockingCount: result.blockingCount ?? 0,
        };
        outputsByStep[stepId] = out;
        await upsertCheckpoint(sql, {
          runId,
          stepId,
          status: "WAITING_FOR_APPROVAL",
          inputHash,
          outputRef: out,
          attemptCount: (existing?.attemptCount ?? 0) + 1,
          checkpointId: existing?.id,
        });
        await updateExecutionRunStatus(sql, context.tenantId, runId, "WAITING_FOR_APPROVAL");
        return {
          runId,
          status: "WAITING_FOR_APPROVAL",
          exitCode: PIPELINE_EXIT_WAITING_APPROVAL,
          outputsByStep,
          executedSteps,
          skippedSteps,
        };
      }

      if (result.kind === "failure") {
        await upsertCheckpoint(sql, {
          runId,
          stepId,
          status: "FAILED",
          inputHash,
          outputRef: null,
          attemptCount: (existing?.attemptCount ?? 0) + 1,
          checkpointId: existing?.id,
        });
        await updateExecutionRunStatus(sql, context.tenantId, runId, "FAILED", {
          message: result.message,
        });
        return {
          runId,
          status: "FAILED",
          exitCode: PIPELINE_EXIT_ERROR,
          outputsByStep,
          executedSteps,
          skippedSteps,
        };
      }

      outputsByStep[stepId] = result.output;
      executedSteps.push(stepId);
      await upsertCheckpoint(sql, {
        runId,
        stepId,
        status: "COMPLETED",
        inputHash,
        outputRef: result.output,
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        checkpointId: existing?.id,
      });

      if (options.interruptAfterStep === stepId) {
        await updateExecutionRunStatus(sql, context.tenantId, runId, "RUNNING");
        return {
          runId,
          status: "RUNNING",
          exitCode: PIPELINE_EXIT_ERROR,
          outputsByStep,
          executedSteps,
          skippedSteps,
        };
      }
    }

    await updateExecutionRunStatus(sql, context.tenantId, runId, "COMPLETED");
    return {
      runId,
      status: "COMPLETED",
      exitCode: PIPELINE_EXIT_SUCCESS,
      outputsByStep,
      executedSteps,
      skippedSteps,
    };
  } catch (err) {
    const pipelineErr = isPipelineError(err)
      ? err
      : new PipelineError(
          ERR_PIPELINE_INVALID_DAG,
          err instanceof Error ? err.message : String(err),
          err,
        );
    await updateExecutionRunStatus(sql, context.tenantId, runId, "FAILED", {
      code: pipelineErr.code,
      message: pipelineErr.message,
    });
    throw pipelineErr;
  }
}

export async function runPipeline(
  sql: Sql,
  options: RunPipelineOptions,
): Promise<PipelineExecutionResult> {
  return executePipeline({ sql, options });
}

export async function resumePipeline(
  sql: Sql,
  options: ResumePipelineOptions,
): Promise<PipelineExecutionResult> {
  return executePipeline({
    sql,
    options,
    existingRunId: options.runId,
    resume: true,
  });
}

export function validatePipelineDefinition(
  definition: PipelineDefinition,
  registry: StepRegistry,
): { valid: true; order: string[] } | { valid: false; error: PipelineError } {
  try {
    const order = validateDagAndContracts(definition, registry);
    return { valid: true, order };
  } catch (err) {
    if (isPipelineError(err)) {
      return { valid: false, error: err };
    }
    return {
      valid: false,
      error: new PipelineError(
        ERR_PIPELINE_INVALID_DAG,
        err instanceof Error ? err.message : String(err),
        err,
      ),
    };
  }
}