import { createHash } from "node:crypto";

export class ResumeArtifactHashError extends Error {
  readonly code = "ERR_RESUME_ARTIFACT_HASH_MISMATCH";

  constructor(message: string) {
    super(message);
    this.name = "ResumeArtifactHashError";
  }
}

export type ResumableCheckpoint<T> = {
  readonly artifactSha256: string;
  readonly completed: number;
  readonly outputs: readonly T[];
};

export type ResumableBatchResult<T> = {
  readonly interrupted: boolean;
  readonly checkpoint: ResumableCheckpoint<T>;
};

export function artifactSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Applies a batch with an explicit checkpoint. An interrupt at `interruptAfterRatio`
 * stops at floor(n * ratio) without rewriting the source bytes. Resume continues
 * from `checkpoint.completed` and rejects a changed artifact hash.
 */
export function runResumableBatch<T>(options: {
  artifactBytes: Uint8Array;
  items: readonly string[];
  mapItem: (item: string, index: number) => T;
  checkpoint?: ResumableCheckpoint<T>;
  interruptAfterRatio?: number;
}): ResumableBatchResult<T> {
  const digest = artifactSha256(options.artifactBytes);
  const prior = options.checkpoint;
  if (prior && prior.artifactSha256 !== digest) {
    throw new ResumeArtifactHashError(
      "Input artifact SHA-256 changed since checkpoint; aborting resume",
    );
  }
  const start = prior?.completed ?? 0;
  if (start < 0 || start > options.items.length) {
    throw new Error("ERR_RESUME_CHECKPOINT_RANGE");
  }
  const outputs: T[] = [...(prior?.outputs ?? [])];
  const ratio = options.interruptAfterRatio;
  const interruptAt =
    ratio === undefined ? options.items.length : Math.floor(options.items.length * ratio);
  const limit = Math.max(interruptAt, start);
  let cursor = start;
  while (cursor < options.items.length && cursor < limit) {
    outputs.push(options.mapItem(options.items[cursor]!, cursor));
    cursor += 1;
  }
  return {
    interrupted: cursor < options.items.length,
    checkpoint: {
      artifactSha256: digest,
      completed: cursor,
      outputs,
    },
  };
}
