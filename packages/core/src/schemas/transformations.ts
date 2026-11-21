import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./primitives.js";
import { OptionalEntityMetadataSchema } from "./metadata.js";
import { EvidenceRefSchema } from "./evidence.js";

export const TransformationRecordSchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    ruleId: z.string().min(1),
    ruleVersion: z.string().min(1),
    inputRefs: z.array(EvidenceRefSchema).min(1),
    outputRef: EvidenceRefSchema,
    appliedAt: IsoDateTimeSchema,
    deterministic: z.boolean(),
    createdAt: IsoDateTimeSchema,
  })
  .merge(OptionalEntityMetadataSchema.pick({ aiMetadata: true, tags: true }))
  .strict();

export type TransformationRecord = z.infer<typeof TransformationRecordSchema>;