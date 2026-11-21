import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./primitives.js";
import { OptionalEntityMetadataSchema } from "./metadata.js";

export const EntityStatusSchema = z.enum([
  "DRAFT",
  "VERIFIED",
  "BLOCKED",
  "SUPERSEDED",
  "MIGRATED",
]);

export const NormalizedEntitySchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    schemaVersionId: UuidSchema,
    entityType: z.string().min(1),
    naturalKey: z.string().min(1),
    status: EntityStatusSchema,
    canonicalData: z.record(z.string(), z.unknown()),
    createdAt: IsoDateTimeSchema,
  })
  .merge(OptionalEntityMetadataSchema)
  .strict();

export type NormalizedEntity = z.infer<typeof NormalizedEntitySchema>;