import type { Sql } from "postgres";

import {
  ERR_ARTIFACT_HASH_MISMATCH,
  ERR_PIPELINE_INVALID_DAG,
  ERR_PIPELINE_INVALID_RETRIES,
  ERR_PIPELINE_INVALID_STATE,
  ERR_PIPELINE_RUN_MISMATCH,
  ERR_PIPELINE_RUN_NOT_FOUND,
  ERR_PIPELINE_TENANT_MISMATCH,
  isPipelineError,
  PipelineError,
} from "./errors.js";
import { computeStepInputHash } from "./input-hash.js";
import { validateDagAndContracts } from "./contracts.js";
import { HumanDecisionSchema, PipelineRetriesSchema } from "./schemas.js";
import {
  createExecutionRun,
  getExecutionRun,
  listCheckpoints,
  persistStepCheckpoint,
  recordHumanDecision,
  updateExecutionRunStatus,
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
const RESUMABLE_STATUSES = new Set(["RUNNING", "WAITING_FOR_APPROVAL"]);

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

function validatedRetries(step: PipelineStepDef) {
  const parsed = PipelineRetriesSchema.safeParse(step.retries ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "retries"}: ${issue.message}`)
      .join("; ");
    throw new PipelineError(
      ERR_PIPELINE_INVALID_RETRIES,
      `Invalid retries for step "${step.id}" — ${detail}`,
    );
  }
  return parsed.data;
}

interface RetryOutcome {
  readonly result: StepExecuteResult;
  /** Número real de llamadas al paso, incluidos los reintentos. */
  readonly attempts: number;
}

async function executeWithRetry(
  step: PipelineStepDef,
  entry: ReturnType<typeof registryEntry>,
  _ctx: RunPipelineOptions["context"],
  request: StepExecutionRequest,
): Promise<RetryOutcome> {
  const retries = validatedRetries(step);
  const maxAttempts =
    retries.maxAttempts ?? (step.idempotent ? DEFAULT_MAX_ATTEMPTS : 1);
  const backoffMs = retries.backoffMs ?? DEFAULT_BACKOFF_MS;
  let last: StepExecuteResult = {
    kind: "failure",
    retryable: false,
    message: "no attempts",
  };
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const result = await entry.execute(_ctx.stepContext, {
      ...request,
      isHumanGate: step.gate === "human_review" || step.uses === "pipeline.human_review",
    });
    if (result.kind !== "failure") {
      return { result, attempts };
    }
    last = result;
    const allowRetry = step.idempotent && result.retryable && attempt < maxAttempts;
    if (!allowRetry) {
      return { result, attempts };
    }
    await sleep(backoffMs * attempt);
  }
  return { result: last, attempts };
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
  const lastStepId = order[order.length - 1];

  let runId = existingRunId;
  if (!runId) {
    const run = await createExecutionRun(sql, {
      tenantId: context.tenantId,
      pipelineId: definition.pipelineId,
      pipelineVersion: definition.pipelineVersion,
    });
    runId = run.id;
  }

  const priorCheckpoints = await listCheckpoints(sql, context.tenantId, runId);
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

      const isGate =
        step.gate === "human_review" || step.uses === "pipeline.human_review";

      if (resume && isGate && existing?.status === "WAITING_FOR_APPROVAL") {
        // La compuerta NO se re-ejecuta sin una decisión humana persistida.
        if (!existing.decisionJson || existing.decisionConsumedAt) {
          return {
            runId,
            status: "WAITING_FOR_APPROVAL",
            exitCode: PIPELINE_EXIT_WAITING_APPROVAL,
            outputsByStep,
            executedSteps,
            skippedSteps,
          };
        }
      }

      const entry = registryEntry(registry, step);
      const consumeDecision =
        resume && isGate && Boolean(existing?.decisionJson) && !existing?.decisionConsumedAt;
      await persistStepCheckpoint(sql, {
        tenantId: context.tenantId,
        runId,
        stepId,
        status: "RUNNING",
        inputHash,
        outputRef: null,
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        checkpointId: existing?.id,
        consumeDecision,
      });

      const { result, attempts } = await executeWithRetry(step, entry, context, {
        stepId: step.id,
        config: step.config ?? {},
        upstreamOutputs: outputsByStep,
        isHumanGate: isGate,
      });
      const totalAttempts = (existing?.attemptCount ?? 0) + attempts;

      if (result.kind === "waiting_approval") {
        const out = result.output ?? {
          blockingCount: result.blockingCount ?? 0,
        };
        outputsByStep[stepId] = out;
        await persistStepCheckpoint(sql, {
          tenantId: context.tenantId,
          runId,
          stepId,
          status: "WAITING_FOR_APPROVAL",
          inputHash,
          outputRef: out,
          attemptCount: totalAttempts,
          checkpointId: existing?.id,
          runStatus: "WAITING_FOR_APPROVAL",
        });
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
        await persistStepCheckpoint(sql, {
          tenantId: context.tenantId,
          runId,
          stepId,
          status: "FAILED",
          inputHash,
          outputRef: null,
          attemptCount: totalAttempts,
          checkpointId: existing?.id,
          runStatus: "FAILED",
          errorJson: { message: result.message },
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
      const interrupted = options.interruptAfterStep === stepId;
      await persistStepCheckpoint(sql, {
        tenantId: context.tenantId,
        runId,
        stepId,
        status: "COMPLETED",
        inputHash,
        outputRef: result.output,
        attemptCount: totalAttempts,
        checkpointId: existing?.id,
        runStatus: interrupted ? "RUNNING" : stepId === lastStepId ? "COMPLETED" : undefined,
      });

      if (interrupted) {
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

    // Los pasos ya completados en una reanudación no vuelven a escribir su
    // checkpoint, así que el estado final se persiste aquí de forma aislada.
    const finalStatus = await getExecutionRun(sql, context.tenantId, runId);
    if (finalStatus?.status !== "COMPLETED") {
      await updateExecutionRunStatus(sql, context.tenantId, runId, "COMPLETED");
    }
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
  const { tenantId } = options.context;
  const run = await getExecutionRun(sql, tenantId, options.runId);
  if (!run) {
    throw new PipelineError(
      ERR_PIPELINE_RUN_NOT_FOUND,
      `Run "${options.runId}" not found for tenant "${tenantId}"`,
    );
  }
  if (run.tenantId !== tenantId) {
    throw new PipelineError(
      ERR_PIPELINE_TENANT_MISMATCH,
      `Run "${options.runId}" belongs to a different tenant`,
    );
  }
  if (
    run.pipelineId !== options.definition.pipelineId ||
    run.pipelineVersion !== options.definition.pipelineVersion
  ) {
    throw new PipelineError(
      ERR_PIPELINE_RUN_MISMATCH,
      `Run "${options.runId}" belongs to pipeline ${run.pipelineId}@${run.pipelineVersion}`,
    );
  }
  if (!RESUMABLE_STATUSES.has(run.status)) {
    throw new PipelineError(
      ERR_PIPELINE_INVALID_STATE,
      `Run "${options.runId}" is ${run.status} and cannot be resumed`,
    );
  }

  if (options.humanDecision) {
    const decision = HumanDecisionSchema.parse(options.humanDecision);
    await recordHumanDecision(sql, {
      tenantId,
      runId: options.runId,
      decision,
    });
  }

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
