import { z } from "zod";
import { IsoDateTimeSchema, SemVerSchema, UuidSchema } from "./primitives.js";

/** Metadatos opcionales compartidos (QR-CORE-006). */
export const OptionalEntityMetadataSchema = z.object({
  tags: z.array(z.string()).optional(),
  aiMetadata: z
    .object({
      modelId: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      pNull: z.number().min(0).max(1).optional(),
      spans: z.array(z.tuple([z.number().int(), z.number().int()])).optional(),
    })
  .optional(),
  customAnnotations: z.record(z.string(), z.unknown()).optional(),
});

/** Campos obligatorios mínimos para entidades con linaje temporal. */
export const RequiredEntityMetadataSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  schemaVersion: SemVerSchema,
  createdAt: IsoDateTimeSchema,
});

export const MinimalRecordSchema = RequiredEntityMetadataSchema.merge(
  OptionalEntityMetadataSchema,
).strict();