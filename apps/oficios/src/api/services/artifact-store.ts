import type { ArtifactStorePort } from "@quimera/core";
import { InMemoryArtifactStore } from "@quimera/core";
import { FsArtifactStore, createS3ArtifactStore } from "@quimera/data-exodus";

export type OficiosArtifactStoreKind = "memory" | "fs" | "s3";

function resolveArtifactStoreKind(): OficiosArtifactStoreKind {
  const explicit = process.env.OFICIOS_ARTIFACT_STORE?.trim().toLowerCase();
  if (explicit === "memory" || explicit === "fs" || explicit === "s3") {
    return explicit;
  }
  if (process.env.NODE_ENV === "test" || process.env.OFICIOS_AUTH_MODE === "test-headers") {
    return "memory";
  }
  return "memory";
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta variable de entorno requerida: ${name}`);
  }
  return value;
}

export function createWorkbenchArtifactStore(
  kind: OficiosArtifactStoreKind = resolveArtifactStoreKind(),
): ArtifactStorePort {
  switch (kind) {
    case "memory":
      return new InMemoryArtifactStore();
    case "fs":
      return new FsArtifactStore(requireEnv("OFICIOS_ARTIFACT_DIR"));
    case "s3":
      return createS3ArtifactStore({
        endpoint: requireEnv("OFICIOS_S3_ENDPOINT"),
        bucket: requireEnv("OFICIOS_S3_BUCKET"),
        region: process.env.OFICIOS_S3_REGION?.trim() || "us-east-1",
        accessKeyId: requireEnv("OFICIOS_S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("OFICIOS_S3_SECRET_ACCESS_KEY"),
      });
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Almacén de proceso para artefactos del portal y de los adjuntos. */
export const workbenchArtifactStore = createWorkbenchArtifactStore();