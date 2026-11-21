import { z } from "zod";
import { Sha256HexSchema, UuidSchema } from "./primitives.js";

export const ParseStatusSchema = z.enum(["OK", "ERROR", "SKIPPED"]);

export const RawRecordSchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    batchId: UuidSchema,
    artifactId: UuidSchema,
    sourceLocator: z.string().min(1),
    recordHash: Sha256HexSchema,
    rawPayload: z.record(z.string(), z.unknown()),
    parseStatus: ParseStatusSchema,
    parseError: z.string().optional(),
  })
  .strict();

export type RawRecord = z.infer<typeof RawRecordSchema>;