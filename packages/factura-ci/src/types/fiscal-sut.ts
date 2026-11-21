export type FiscalDocType = "01" | "04";
export type FiscalCurrency = "CRC" | "USD";

export interface FiscalEmitInput {
  readonly tenantId: string;
  readonly operationId: string;
  readonly docType: FiscalDocType;
  readonly amountMinor: bigint;
  readonly currency: FiscalCurrency;
  readonly concurrent?: boolean;
}

export interface FiscalEmitResult {
  readonly clave: string;
  readonly consecutivo: string;
  readonly state: string;
  readonly xml?: string;
}

export interface FiscalStatusResult {
  readonly state: string;
}

export interface FiscalSut {
  emit(input: FiscalEmitInput): Promise<FiscalEmitResult>;
  status(tenantId: string, clave: string): Promise<FiscalStatusResult>;
  restart(): Promise<void>;
}

export type SutKind = "buggy" | "compliant";