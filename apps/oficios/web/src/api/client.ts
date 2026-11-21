import type { DevApiConfig } from "../config.js";
import type {
  ApiErrorResponse,
  CabysSearchResponse,
  CustomerListItem,
  ProvenanceResponse,
  SerializedWorkOrder,
  WorkOrderDetailResponse,
  WorkOrderListResponse,
} from "./types.js";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: ApiErrorResponse | undefined;

  constructor(
    message: string,
    status: number,
    code?: string,
    body?: ApiErrorResponse,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function headers(config: DevApiConfig, json = false): HeadersInit {
  const h: Record<string, string> = {
    "x-tenant-id": config.tenantId,
    "x-test-role": config.testRole,
    "x-actor-id": config.actorId,
  };
  if (json) {
    h["content-type"] = "application/json";
  }
  return h;
}

async function parseError(res: Response): Promise<ApiRequestError> {
  let body: ApiErrorResponse | undefined;
  try {
    body = (await res.json()) as ApiErrorResponse;
  } catch {
    body = undefined;
  }
  const message =
    body?.error?.message ??
    "No se pudo completar la solicitud. Intente de nuevo.";
  return new ApiRequestError(
    message,
    res.status,
    body?.error?.code,
    body,
  );
}

export function formatOrdenFolio(workOrderId: string): string {
  const compact = workOrderId.replace(/-/g, "").toLowerCase();
  const suffix = compact.slice(-4).padStart(4, "0");
  return `OS-2026-${suffix}`;
}

export async function fetchEquipment(
  config: DevApiConfig,
  customerId: string,
): Promise<readonly { id: string; serialNumber: string | null }[]> {
  const res = await fetch(
    `${config.apiBase}/api/v1/customers/${encodeURIComponent(customerId)}/equipment`,
    { headers: headers(config) },
  );
  if (!res.ok) throw await parseError(res);
  const json = (await res.json()) as {
    equipment: Array<{ id: string; serialNumber: string | null }>;
  };
  return json.equipment;
}

export async function fetchCustomers(config: DevApiConfig): Promise<readonly CustomerListItem[]> {
  const res = await fetch(`${config.apiBase}/api/v1/customers`, { headers: headers(config) });
  if (!res.ok) {
    throw await parseError(res);
  }
  const json = (await res.json()) as { customers: CustomerListItem[] };
  return json.customers;
}

export async function createWorkOrder(
  config: DevApiConfig,
  customerId: string,
  equipmentId: string,
): Promise<SerializedWorkOrder> {
  const res = await fetch(`${config.apiBase}/api/v1/work-orders`, {
    method: "POST",
    headers: headers(config, true),
    body: JSON.stringify({ customerId, equipmentId }),
  });
  if (!res.ok) throw await parseError(res);
  const json = (await res.json()) as WorkOrderDetailResponse;
  return json.workOrder;
}

export async function saveDiagnosis(
  config: DevApiConfig,
  workOrderId: string,
  notes: string,
  measurements: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${config.apiBase}/api/v1/work-orders/${encodeURIComponent(workOrderId)}/diagnosis`, {
    method: "POST",
    headers: headers(config, true),
    body: JSON.stringify({ notes, measurements, attachments: [] }),
  });
  if (!res.ok) throw await parseError(res);
}

export async function saveMaterial(
  config: DevApiConfig,
  workOrderId: string,
  input: { cabysCode: string; quantity: string; unitPriceMinor: number; taxRate: string },
): Promise<void> {
  const res = await fetch(`${config.apiBase}/api/v1/work-orders/${encodeURIComponent(workOrderId)}/materials`, {
    method: "POST",
    headers: headers(config, true),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
}

export async function closeWorkOrder(
  config: DevApiConfig,
  workOrderId: string,
  expectedVersion: number,
): Promise<{ fiscalIntentId: string }> {
  const res = await fetch(`${config.apiBase}/api/v1/work-orders/${encodeURIComponent(workOrderId)}/close`, {
    method: "POST",
    headers: headers(config, true),
    body: JSON.stringify({ expectedVersion }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { fiscalIntentId: string };
}

export async function fetchWorkOrder(
  config: DevApiConfig,
  workOrderId: string,
): Promise<SerializedWorkOrder> {
  const byId = await fetch(
    `${config.apiBase}/api/v1/work-orders/${encodeURIComponent(workOrderId)}`,
    { headers: headers(config) },
  );
  if (byId.ok) {
    const json = (await byId.json()) as WorkOrderDetailResponse;
    return json.workOrder;
  }

  if (byId.status !== 404 && byId.status !== 405) {
    throw await parseError(byId);
  }

  const listRes = await fetch(`${config.apiBase}/api/v1/work-orders`, {
    headers: headers(config),
  });
  if (listRes.ok) {
    const json = (await listRes.json()) as WorkOrderListResponse;
    const match =
      json.workOrders.find((wo) => wo.id === workOrderId) ?? json.workOrders[0];
    if (match) {
      return match;
    }
  }

  throw new ApiRequestError(
    "Orden de servicio no encontrada. Verifique el identificador o la API.",
    404,
  );
}

export async function fetchCustomerProvenance(
  config: DevApiConfig,
  customerId: string,
): Promise<ProvenanceResponse> {
  const res = await fetch(
    `${config.apiBase}/api/v1/customers/${encodeURIComponent(customerId)}/provenance`,
    { headers: headers(config) },
  );
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as ProvenanceResponse;
}

export async function searchCabysRepuestos(
  config: DevApiConfig,
  query: string,
): Promise<CabysSearchResponse> {
  const res = await fetch(
    `${config.apiBase}/api/v1/catalog/cabys?q=${encodeURIComponent(query)}`,
    { headers: headers(config) },
  );
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as CabysSearchResponse;
}

export async function transitionWorkOrder(
  config: DevApiConfig,
  workOrderId: string,
  targetStatus: string,
  expectedVersion: number,
): Promise<SerializedWorkOrder> {
  const res = await fetch(
    `${config.apiBase}/api/v1/work-orders/${encodeURIComponent(workOrderId)}/transition`,
    {
      method: "PATCH",
      headers: headers(config, true),
      body: JSON.stringify({ targetStatus, expectedVersion }),
    },
  );
  if (!res.ok) {
    throw await parseError(res);
  }
  const json = (await res.json()) as WorkOrderDetailResponse;
  return json.workOrder;
}

export async function registerCustomerApproval(
  config: DevApiConfig,
  workOrderId: string,
  approverName?: string,
): Promise<SerializedWorkOrder> {
  const res = await fetch(
    `${config.apiBase}/api/v1/work-orders/${encodeURIComponent(workOrderId)}/approvals`,
    {
      method: "POST",
      headers: headers(config, true),
      body: JSON.stringify({ approverName: approverName ?? "Cliente en taller" }),
    },
  );
  if (!res.ok) {
    throw await parseError(res);
  }
  const json = (await res.json()) as WorkOrderDetailResponse;
  return json.workOrder;
}