import type { ConflictCode } from "@quimera/core";

export type ConflictSeverity = "BLOCKING" | "WARNING" | "INFO";

export type ProvenanceEntry = {
  artifactId: string;
  sourceLocator: string;
};

export type NormalizedClient = {
  id: string;
  legalName: string;
  taxId?: string;
  recordHash?: string;
  /** Clave numérica de comprobante / entidad fiscal de 50 dígitos (Hacienda). */
  fiscalKey50?: string;
  provenance: ProvenanceEntry[];
};

export type NormalizedInvoice = {
  id: string;
  invoiceNumber: string;
  amountMinor: bigint;
  currency: string;
  recordHash?: string;
  fiscalKey50?: string;
  clientId?: string;
  clientTaxId?: string;
  issueDate?: string;
  provenance: ProvenanceEntry[];
};

export type NormalizedPayment = {
  id: string;
  amountMinor: bigint;
  currency: string;
  invoiceNumber?: string;
  invoiceId?: string;
  clientId?: string;
  clientTaxId?: string;
  paymentDate?: string;
  provenance: ProvenanceEntry[];
};

export type BalanceDeclaration = {
  id: string;
  clientId: string;
  /** Saldo declarado en unidades menores (centavos / céntimos fiscales). */
  declaredBalanceMinor: bigint;
  currency: string;
  provenance: ProvenanceEntry[];
};

export type ReconcileDataset = {
  clients: NormalizedClient[];
  invoices: NormalizedInvoice[];
  payments: NormalizedPayment[];
  balances?: BalanceDeclaration[];
};

export type DetectedConflict = {
  conflictCode: ConflictCode;
  severity: ConflictSeverity;
  autoResolved: boolean;
  candidateRecordIds: string[];
  summary: string;
  /** Huella estable para re-importaciones (ordenada). */
  fingerprint: string;
};

export type ReconcileResult = {
  /** Todas las filas de entrada se conservan sin fusión ni descarte. */
  dataset: ReconcileDataset;
  conflicts: DetectedConflict[];
  countsByCode: Partial<Record<ConflictCode, number>>;
};