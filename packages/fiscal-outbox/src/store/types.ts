export type FiscalEnvironment = "staging" | "production" | "mock";

export type FiscalIntentStatus =
  | "QUEUED"
  | "DOCUMENT_ASSIGNED"
  | "COMPLETED"
  | "REQUIRES_REVIEW"
  | "CANCELLED";

export type EnqueueFiscalIntentInput = {
  readonly tenantId: string;
  readonly issuerId: string;
  readonly environment: FiscalEnvironment;
  readonly operationId: string;
  readonly purpose?: string;
  readonly docType: string;
  readonly payloadSnapshot: unknown;
};

export type FiscalIntentRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly issuerId: string;
  readonly environment: FiscalEnvironment;
  readonly operationId: string;
  readonly purpose: string;
  readonly docType: string;
  readonly status: FiscalIntentStatus;
  readonly payloadSnapshot: unknown;
  readonly createdAt: string;
};

export type AllocateConsecutiveScope = {
  readonly tenantId: string;
  readonly issuerId: string;
  readonly environment: FiscalEnvironment;
  readonly branch: string;
  readonly terminal: string;
  readonly docType: string;
};

/** Campos de StoredDocument no desnormalizados en columnas relacionales. */
export type DeliverySnapshotPayload = {
  readonly xml: string;
  readonly situation: string;
  readonly generatedAt: string;
  readonly deadlineBusinessDays: number;
  readonly transitions: ReadonlyArray<{
    readonly from: string;
    readonly to: string;
    readonly at: string;
    readonly reason?: string;
  }>;
  readonly obligation: unknown;
  readonly provisionalReference?: string;
};

export const DELIVERY_SNAPSHOT_JSON_KEY = "_deliverySnapshot" as const;