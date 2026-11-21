import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./primitives.js";

export const OriginKindSchema = z.enum([
  "DIRECT_PARSE",
  "RULE_TRANSFORM",
  "HUMAN_DECISION",
  "EXTERNAL_API",
  "AI_EXTRACTION",
]);

export type OriginKind = z.infer<typeof OriginKindSchema>;

const ProvenanceMetadataSchema = z
  .object({
    confidence: z.number().min(0).max(1).optional(),
    pNull: z.number().min(0).max(1).optional(),
    valid: z.boolean().optional(),
    complete: z.boolean().optional(),
    charSpans: z.array(z.tuple([z.number().int(), z.number().int()])).optional(),
    passportId: z.string().optional(),
    passportVersion: z.string().optional(),
  })
  .superRefine((meta, ctx) => {
    // confidence is required when originKind is AI_EXTRACTION — checked at object level
    void meta;
    void ctx;
  });

export const ProvenanceEntrySchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    entityId: UuidSchema,
    fieldPath: z.string().min(1),
    rawRecordId: UuidSchema.optional(),
    artifactId: UuidSchema,
    schemaVersionId: UuidSchema,
    decisionId: UuidSchema.optional(),
    originKind: OriginKindSchema,
    transformationId: z.string().min(1),
    ruleVersion: z.string().min(1),
    metadata: ProvenanceMetadataSchema.optional(),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (
      entry.originKind === "AI_EXTRACTION" &&
      (entry.metadata?.confidence === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "metadata.confidence is required when originKind is AI_EXTRACTION",
        path: ["metadata", "confidence"],
      });
    }
  });

export type ProvenanceEntry = z.infer<typeof ProvenanceEntrySchema>;