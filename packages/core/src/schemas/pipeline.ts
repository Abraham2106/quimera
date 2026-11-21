import { z } from "zod";
import type { OperationResult } from "./operations.js";
import type { LoggerPort } from "../ports/logger.js";
import type { ClockPort } from "../ports/clock.js";
import type { ArtifactStorePort } from "../ports/artifact-store.js";
import type { StructuredExtractorPort } from "../ports/structured-extractor.js";

export const ModuleStepDescriptorSchema = z.object({
  stepId: z.string().min(1),
  inputContract: z.string().min(1),
  outputContract: z.string().min(1),
  idempotent: z.boolean(),
  supportsHumanGate: z.boolean(),
});

export const ModuleCapabilitiesSchema = z
  .object({
    module: z.string().min(1),
    version: z.string().min(1),
    contractVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    requiresAi: z.union([z.literal(false), z.literal("optional")]),
    supportsOffline: z.boolean(),
    steps: z.array(ModuleStepDescriptorSchema),
  })
  .strict();

export type ModuleCapabilities = z.infer<typeof ModuleCapabilitiesSchema>;

export interface StepContext {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly clock: ClockPort;
  readonly logger: LoggerPort;
  readonly artifacts: ArtifactStorePort;
  readonly extractor?: StructuredExtractorPort;
}

export interface PipelineStepPort<TInput, TOutput> {
  readonly stepId: string;
  readonly inputContract: string;
  readonly outputContract: string;
  readonly idempotent: boolean;
  execute(ctx: StepContext, input: TInput): Promise<OperationResult<TOutput>>;
  compensate?(
    ctx: StepContext,
    output: TOutput,
  ): Promise<OperationResult<void>>;
}