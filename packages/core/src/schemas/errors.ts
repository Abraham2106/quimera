import { z } from "zod";
import { ErrCodeSchema, UuidSchema, WarningCodeSchema } from "./primitives.js";

export const QuimeraErrorCategorySchema = z.enum([
  "VALIDATION",
  "CONTRACT",
  "CONFLICT",
  "EXTERNAL_API",
  "SECURITY",
  "STORAGE",
  "FISCAL",
  "INTERNAL",
]);

export const QuimeraErrorSchema = z
  .object({
    code: ErrCodeSchema,
    category: QuimeraErrorCategorySchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    requiresHumanReview: z.boolean().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    correlationId: UuidSchema,
    module: z.string().min(1),
  })
  .strict();

export type QuimeraError = z.infer<typeof QuimeraErrorSchema>;

export const QuimeraWarningSchema = z
  .object({
    code: WarningCodeSchema,
    message: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type QuimeraWarning = z.infer<typeof QuimeraWarningSchema>;