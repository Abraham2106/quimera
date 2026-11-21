import { z } from "zod";
import { IsoDateTimeSchema, Sha256HexSchema, UuidSchema } from "./primitives.js";

export const EvidenceLocatorSchema = z.object({
  kind: z.string().min(1),
  sheet: z.string().optional(),
  rowNumber: z.number().int().positive().optional(),
  xpath: z.string().optional(),
  charSpan: z.tuple([z.number().int(), z.number().int()]).optional(),
});

export const EvidenceRefSchema = z
  .object({
    artifactId: UuidSchema,
    artifactSha256: Sha256HexSchema.optional(),
    rawRecordId: UuidSchema.optional(),
    locator: EvidenceLocatorSchema,
    capturedAt: IsoDateTimeSchema,
  })
  .strict();

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;