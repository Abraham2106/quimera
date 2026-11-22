import type { ArtifactQuarantine } from "./s3-artifact-store.js";
import { S3ArtifactStore } from "./s3-artifact-store.js";
import { S3HttpObjectLockClient } from "./s3-http-object-lock-client.js";

export type CreateS3ArtifactStoreOptions = {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly quarantine?: ArtifactQuarantine;
  readonly now?: () => Date;
  readonly fetchImpl?: typeof fetch;
};

export function createS3ArtifactStore(
  options: CreateS3ArtifactStoreOptions,
): S3ArtifactStore {
  const client = new S3HttpObjectLockClient({
    endpoint: options.endpoint,
    bucket: options.bucket,
    region: options.region,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    fetchImpl: options.fetchImpl,
  });
  return new S3ArtifactStore(client, {
    quarantine: options.quarantine,
    now: options.now,
  });
}