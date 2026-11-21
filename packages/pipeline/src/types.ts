import type { StepContext } from "@quimera/core";

export const PIPELINE_EXIT_SUCCESS = 0;
export const PIPELINE_EXIT_ERROR = 1;
export const PIPELINE_EXIT_WAITING_APPROVAL = 3;

export type ExecutionRunStatus =
  | "RUNNING"
  | "WAITING_FOR_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type CheckpointStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "WAITING_FOR_APPROVAL"
  | "FAILED";

export interface PipelineRetries {
  readonly maxAttempts?: number;
  readonly backoffMs?: number;
}

export interface PipelineStepDef {
  readonly id: string;
  readonly uses: string;
  readonly contractVersion: string;
  readonly idempotent: boolean;
  readonly dependsOn?: readonly string[];
  readonly gate?: "human_review";
  readonly config?: Readonly<Record<string, unknown>>;
  readonly retries?: PipelineRetries;
}

export interface PipelineDefinition {
  readonly pipelineId: string;
  readonly pipelineVersion: string;
  readonly contractVersion?: string;
  readonly steps: readonly PipelineStepDef[];
}

export interface StepContractRef {
  readonly name: string;
  readonly version: string;
}

export interface StepExecutionRequest {
  readonly stepId: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly upstreamOutputs: Readonly<Record<string, unknown>>;
  readonly isHumanGate: boolean;
}

export type StepExecuteResult =
  | { readonly kind: "success"; readonly output: unknown }
  | {
      readonly kind: "waiting_approval";
      readonly output?: unknown;
      readonly blockingCount?: number;
    }
  | { readonly kind: "failure"; readonly retryable: boolean; readonly message: string };

export interface StepRegistryEntry {
  readonly uses: string;
  readonly implementationVersion: string;
  readonly inputContract: StepContractRef;
  readonly outputContract: StepContractRef;
  readonly idempotent: boolean;
  readonly execute: (
    ctx: StepContext,
    request: StepExecutionRequest,
  ) => Promise<StepExecuteResult>;
}

export type StepRegistry = Readonly<Record<string, StepRegistryEntry>>;

export interface RunContext {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly stepContext: StepContext;
}

export interface CheckpointRecord {
  readonly id: string;
  readonly runId: string;
  readonly stepId: string;
  readonly status: CheckpointStatus;
  readonly inputHash: string;
  readonly outputRef: unknown | null;
  readonly attemptCount: number;
}

export interface ExecutionRunRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly pipelineId: string;
  readonly pipelineVersion: string;
  readonly status: ExecutionRunStatus;
  readonly metricsJson: Record<string, unknown>;
  readonly errorJson: Record<string, unknown> | null;
}

export interface PipelineExecutionResult {
  readonly runId: string;
  readonly status: ExecutionRunStatus;
  readonly exitCode: number;
  readonly outputsByStep: Readonly<Record<string, unknown>>;
  readonly executedSteps: readonly string[];
  readonly skippedSteps: readonly string[];
}

export interface RunPipelineOptions {
  readonly definition: PipelineDefinition;
  readonly registry: StepRegistry;
  readonly context: RunContext;
  readonly interruptAfterStep?: string;
  readonly simulateCrash?: boolean;
}

export interface ResumePipelineOptions {
  readonly runId: string;
  readonly definition: PipelineDefinition;
  readonly registry: StepRegistry;
  readonly context: RunContext;
}