import { z } from "zod";
import { QuimeraErrorSchema, QuimeraWarningSchema } from "./errors.js";

export const ExecutionMetricsSchema = z
  .object({
    startedAt: z.string().datetime({ offset: true }).optional(),
    finishedAt: z.string().datetime({ offset: true }).optional(),
    durationMs: z.number().int().nonnegative().optional(),
    counts: z.record(z.string(), z.number().int()).optional(),
  })
  .strict();

export type ExecutionMetrics = z.infer<typeof ExecutionMetricsSchema>;

export const ExecutionStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const ExecutionResultSchema = z
  .object({
    status: ExecutionStatusSchema,
    metrics: ExecutionMetricsSchema.optional(),
    error: QuimeraErrorSchema.optional(),
  })
  .strict();

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export function createOperationResultSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      data: dataSchema,
      warnings: z.array(QuimeraWarningSchema),
      metrics: ExecutionMetricsSchema.optional(),
    }),
    z.object({
      ok: z.literal(false),
      error: QuimeraErrorSchema,
      warnings: z.array(QuimeraWarningSchema),
      metrics: ExecutionMetricsSchema.optional(),
    }),
  ]);
}

export type OperationResult<T> =
  | {
      ok: true;
      data: T;
      warnings: z.infer<typeof QuimeraWarningSchema>[];
      metrics?: ExecutionMetrics;
    }
  | {
      ok: false;
      error: z.infer<typeof QuimeraErrorSchema>;
      warnings: z.infer<typeof QuimeraWarningSchema>[];
      metrics?: ExecutionMetrics;
    };

export const AsyncOperationStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const AsyncOperationHandleSchema = z
  .object({
    operationId: z.string().min(1),
    status: AsyncOperationStatusSchema,
    progress: z
      .object({
        completed: z.number().int().nonnegative(),
        total: z.number().int().positive().optional(),
      })
      .optional(),
    checkpointStepId: z.string().optional(),
    pollAfterMs: z.number().int().positive().optional(),
  })
  .strict();

export type AsyncOperationHandle = z.infer<typeof AsyncOperationHandleSchema>;