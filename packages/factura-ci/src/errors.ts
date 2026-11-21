export class FacturaCiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FacturaCiError";
    this.code = code;
  }
}