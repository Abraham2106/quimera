import type { EvidenceArtifact } from "../schemas/artifacts.js";
import type { OperationResult } from "../schemas/operations.js";

export interface ArtifactStorePutInput {
  readonly tenantId: string;
  readonly bytes: Uint8Array;
  readonly artifactKind: EvidenceArtifact["artifactKind"];
  readonly originalName: string;
  readonly mimeType: string;
}

export interface ArtifactStorePort {
  put(input: ArtifactStorePutInput): Promise<OperationResult<EvidenceArtifact>>;
  get(storageUri: string): Promise<OperationResult<Uint8Array>>;
  existsBySha256(tenantId: string, sha256: string): Promise<boolean>;
}