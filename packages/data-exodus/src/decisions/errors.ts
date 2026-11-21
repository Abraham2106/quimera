export type DataExodusErrorCode =
  | "ERR_CONFLICT_ALREADY_RESOLVED"
  | "ERR_CONFLICT_NOT_FOUND"
  | "ERR_DECISION_INVALID_SUPERSEDES"
  | "ERR_MIGRATION_BLOCKED_BY_CONFLICTS"
  | "ERR_ENTITY_NOT_FOUND"
  | "ERR_DATA_COUNT_MISMATCH";

export class DataExodusError extends Error {
  readonly code: DataExodusErrorCode;
  readonly module = "@quimera/data-exodus";
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: DataExodusErrorCode,
    message: string,
    options?: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "DataExodusError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}