import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./primitives.js";

export const ResolutionActionSchema = z.enum([
  "MERGE",
  "KEEP_SEPARATE",
  "OVERRIDE_FIELD",
  "REJECT_RECORD",
  "MARK_UNRECONCILABLE",
  "DEFER",
]);

export const ResolutionActorTypeSchema = z.enum(["RULE", "HUMAN"]);

export const ResolutionDecisionSchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    conflictId: UuidSchema,
    action: ResolutionActionSchema,
    actorType: ResolutionActorTypeSchema,
    actorId: z.string().min(1).max(256),
    rationale: z.string().min(3).max(2000),
    payload: z.record(z.string(), z.unknown()),
    supersedesDecisionId: UuidSchema.optional(),
    decidedAt: IsoDateTimeSchema,
  })
  .strict();

export type ResolutionDecision = z.infer<typeof ResolutionDecisionSchema>;