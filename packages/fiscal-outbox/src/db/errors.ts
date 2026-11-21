export class FiscalOutboxDbError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "FiscalOutboxDbError";
    this.code = code;
  }
}