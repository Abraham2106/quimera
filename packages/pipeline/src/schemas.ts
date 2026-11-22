import { z } from "zod";

/** Límites de reintento permitidos en un paso del manifiesto. */
export const PipelineRetriesSchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(100).optional(),
    backoffMs: z.number().int().min(0).max(600_000).optional(),
  })
  .strict();

/** Decisión humana que desbloquea una compuerta `human_review`. */
export const HumanDecisionSchema = z
  .object({
    actorId: z.string().min(1).max(256),
    action: z.string().min(1).max(64).default("APPROVE"),
    rationale: z.string().min(1).max(2000).default("Aprobado por revisión humana"),
    decidedAt: z.string().min(1).max(64).optional(),
  })
  .strict();

export type PipelineRetriesInput = z.infer<typeof PipelineRetriesSchema>;
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;
export type HumanDecisionInput = z.input<typeof HumanDecisionSchema>;
