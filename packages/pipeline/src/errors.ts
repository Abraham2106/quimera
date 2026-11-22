export const ERR_PIPELINE_INVALID_DAG = "ERR_PIPELINE_INVALID_DAG" as const;
export const ERR_PIPELINE_CONTRACT_MISMATCH = "ERR_PIPELINE_CONTRACT_MISMATCH" as const;
export const ERR_ARTIFACT_HASH_MISMATCH = "ERR_ARTIFACT_HASH_MISMATCH" as const;
export const ERR_PIPELINE_RUN_NOT_FOUND = "ERR_PIPELINE_RUN_NOT_FOUND" as const;
export const ERR_PIPELINE_TENANT_MISMATCH = "ERR_PIPELINE_TENANT_MISMATCH" as const;
export const ERR_PIPELINE_RUN_MISMATCH = "ERR_PIPELINE_RUN_MISMATCH" as const;
export const ERR_PIPELINE_INVALID_STATE = "ERR_PIPELINE_INVALID_STATE" as const;
export const ERR_PIPELINE_INVALID_RETRIES = "ERR_PIPELINE_INVALID_RETRIES" as const;

export type PipelineErrorCode =
  | typeof ERR_PIPELINE_INVALID_DAG
  | typeof ERR_PIPELINE_CONTRACT_MISMATCH
  | typeof ERR_ARTIFACT_HASH_MISMATCH
  | typeof ERR_PIPELINE_RUN_NOT_FOUND
  | typeof ERR_PIPELINE_TENANT_MISMATCH
  | typeof ERR_PIPELINE_RUN_MISMATCH
  | typeof ERR_PIPELINE_INVALID_STATE
  | typeof ERR_PIPELINE_INVALID_RETRIES;

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
