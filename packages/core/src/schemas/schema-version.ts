import { z } from "zod";
import { IsoDateTimeSchema, SemVerSchema, Sha256HexSchema, UuidSchema } from "./primitives.js";

export const CompatibilityModeSchema = z.enum(["STRICT", "BACKWARD", "FORWARD"]);

export const SchemaVersionSchema = z
  .object({
    id: UuidSchema,
    schemaId: z.string().min(1),
    semver: SemVerSchema,
    jsonSchemaHash: Sha256HexSchema,
    compatibilityMode: CompatibilityModeSchema,
    publishedAt: IsoDateTimeSchema,
  })
  .strict();

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;