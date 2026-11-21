export type DbErrorCode =
  | "ERR_DB_CONFIG"
  | "ERR_DB_TENANT_CONTEXT"
  | "ERR_DB_MIGRATION"
  | "ERR_DB_QUERY";

export class QuimeraDbError extends Error {
  readonly code: DbErrorCode;
  readonly module = "@quimera/data-exodus";
  readonly retryable: boolean;

  constructor(
    code: DbErrorCode,
    message: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "QuimeraDbError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}