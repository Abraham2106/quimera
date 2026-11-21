export const ERR_PIPELINE_INVALID_DAG = "ERR_PIPELINE_INVALID_DAG" as const;
export const ERR_PIPELINE_CONTRACT_MISMATCH = "ERR_PIPELINE_CONTRACT_MISMATCH" as const;
export const ERR_ARTIFACT_HASH_MISMATCH = "ERR_ARTIFACT_HASH_MISMATCH" as const;

export type PipelineErrorCode =
  | typeof ERR_PIPELINE_INVALID_DAG
  | typeof ERR_PIPELINE_CONTRACT_MISMATCH
  | typeof ERR_ARTIFACT_HASH_MISMATCH;

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;

  constructor(code: PipelineErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function isPipelineError(value: unknown): value is PipelineError {
  return value instanceof PipelineError;
}