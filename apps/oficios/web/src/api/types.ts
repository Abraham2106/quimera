export type SerializedWorkOrder = {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly equipmentId: string;
  readonly tradeContractId: string;
  readonly status: string;
  readonly customerAuthorized: boolean;
  readonly version: number;
  readonly fiscalIntentId: string | null;
};

export type WorkOrderListResponse = {
  readonly ok: true;
  readonly workOrders: readonly SerializedWorkOrder[];
};

export type WorkOrderDetailResponse = {
  readonly ok: true;
  readonly workOrder: SerializedWorkOrder;
};

export type ApiErrorResponse = {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly correlationId?: string;
  };
};

export type ProvenanceEntry = {
  readonly id: string;
  readonly fieldPath: string;
  readonly originKind: string;
  readonly transformationId: string;
  readonly ruleVersion: string;
  readonly artifactId: string;
  readonly createdAt: string;
};

export type ProvenanceResponse = {
  readonly ok: true;
  readonly provenance: {
    readonly entityId: string;
    readonly entries: readonly ProvenanceEntry[];
  } | null;
};

export type CabysItem = {
  readonly codigo?: string;
  readonly descripcion?: string;
};

export type CabysSearchResponse = {
  readonly ok: true;
  readonly query: string;
  readonly data: {
    readonly cabys?: readonly CabysItem[];
  };
  readonly meta: {
    readonly fromCache: boolean;
    readonly source: string;
  };
};