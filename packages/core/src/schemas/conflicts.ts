import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./primitives.js";

export const ConflictCodeSchema = z.enum([
  "EXACT_DUPLICATE",
  "PROBABLE_DUPLICATE",
  "CONFLICTING_IDENTITY",
  "MONETARY_MISMATCH",
  "MISSING_REQUIRED_DATA",
  "ORPHAN_RECORD",
  "INVALID_REFERENCE",
  "TEMPORAL_ANOMALY",
  "UNIT_OR_CURRENCY_MISMATCH",
  "UNRECONCILABLE_BALANCE",
  "AI_LOW_CONFIDENCE",
]);

export type ConflictCode = z.infer<typeof ConflictCodeSchema>;

export const ConflictSeveritySchema = z.enum(["BLOCKING", "WARNING", "INFO"]);

export const ConflictStatusSchema = z.enum([
  "OPEN",
  "RESOLVED",
  "DEFERRED",
  "UNRECONCILABLE",
]);

export const ConflictEvidenceRefSchema = z.object({
  artifactId: UuidSchema,
  sourceLocator: z.string().min(1),
});

export const ConflictSchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    batchId: UuidSchema.optional(),
    conflictCode: ConflictCodeSchema,
    severity: ConflictSeveritySchema,
    status: ConflictStatusSchema,
    candidateEntityIds: z.array(UuidSchema).min(1),
    evidenceRefs: z.array(ConflictEvidenceRefSchema).min(1),
    summary: z.string().min(1).max(1000),
    detectedAt: IsoDateTimeSchema,
  })
  .strict();

export type Conflict = z.infer<typeof ConflictSchema>;