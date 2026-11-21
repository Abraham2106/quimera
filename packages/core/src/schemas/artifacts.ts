import { z } from "zod";
import {
  IsoDateTimeSchema,
  Sha256HexSchema,
  StorageUriSchema,
  UuidSchema,
} from "./primitives.js";

export const ArtifactKindSchema = z.enum([
  "source_file",
  "fe_xml_unsigned",
  "fe_xml_signed",
  "hacienda_response",
  "work_order_photo",
  "approval_proof",
  "reconciliation_report",
]);

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const EvidenceArtifactSchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    sha256: Sha256HexSchema,
    artifactKind: ArtifactKindSchema,
    originalName: z.string().min(1).max(512),
    mimeType: z.string().min(3).max(128),
    byteSize: z.number().int().nonnegative(),
    storageUri: StorageUriSchema,
    ingestedAt: IsoDateTimeSchema,
  })
  .strict();

export type EvidenceArtifact = z.infer<typeof EvidenceArtifactSchema>;

/** Alias canónico de dominio (`SourceArtifact` ≡ `EvidenceArtifact` en MVP). */
export const SourceArtifactSchema = EvidenceArtifactSchema;
export type SourceArtifact = EvidenceArtifact;