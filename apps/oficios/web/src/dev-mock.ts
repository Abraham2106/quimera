/**
 * Datos sintéticos para recorrer la UI sin API/PostgreSQL.
 * Se activa solo con `?mock=1` en desarrollo. Nunca se incluye en producción.
 */

type Order = {
  id: string;
  tenantId: string;
  customerId: string;
  equipmentId: string;
  tradeContractId: string;
  status: string;
  customerAuthorized: boolean;
  version: number;
  fiscalIntentId: string | null;
  customerLegalName?: string | null;
  equipmentSerial?: string | null;
  diagnoses?: readonly { id: string; notes: string; measurements: Record<string, unknown>; attachments: readonly { sha256: string; filename: string }[] }[];
  materials?: readonly { cabysCode: string; quantity: string; unitPriceMinor: string; taxRateBps: number }[];
  // Nota: unitPriceMinor viaja como string en el contrato serializado.
};

const TENANT = "22222222-2222-7222-8222-222222222222";

const customers = [
  { id: "c-1001", legalName: "Refrigeración Pura Vida S.A.", taxId: "3-101-555443" },
  { id: "c-1002", legalName: "Taller Mecánico Central", taxId: "3-102-778811" },
  { id: "c-1003", legalName: "Clínica Dental Escazú", taxId: "3-104-229900" },
  { id: "c-1004", legalName: "Distribuidora La Esquina", taxId: "3-101-990123" },
];

const equipmentByCustomer: Record<string, { id: string; serialNumber: string | null }[]> = {
  "c-1001": [
    { id: "eq-9001", serialNumber: "CR-HVAC-2026-0042" },
    { id: "eq-9002", serialNumber: "CR-HVAC-2025-1187" },
  ],
  "c-1002": [{ id: "eq-9003", serialNumber: "CR-HVAC-2024-7712" }],
  "c-1003": [{ id: "eq-9004", serialNumber: "CR-HVAC-2026-0311" }],
  "c-1004": [{ id: "eq-9005", serialNumber: "CR-HVAC-2023-5509" }],
};

function order(id: string, customerId: string, equipmentId: string, status: string, authorized: boolean, extras: Partial<Order> = {}): Order {
  return {
    id,
    tenantId: TENANT,
    customerId,
    equipmentId,
    tradeContractId: "hvac-refrigeration-v1",
    status,
    customerAuthorized: authorized,
    version: 3,
    fiscalIntentId: status === "CLOSED" ? "fi-demo-8841" : null,
    customerLegalName: customers.find((c) => c.id === customerId)?.legalName,
    equipmentSerial: equipmentByCustomer[customerId]?.[0]?.serialNumber ?? null,
    diagnoses: [{ id: `dx-${id}`, notes: "Presión de succión fuera de rango", measurements: { succionPsi: 68 }, attachments: [] }],
    materials:
      status === "RECEIVED"
        ? []
        : [{ cabysCode: "8415109010100", quantity: "2", unitPriceMinor: "150000", taxRateBps: 1300 }],
    ...extras,
  };
}

const orders: Order[] = [
  order("wo-260210-0001", "c-1001", "eq-9001", "RECEIVED", false),
  order("wo-260209-0002", "c-1002", "eq-9003", "DIAGNOSED", false),
  order("wo-260209-0003", "c-1003", "eq-9004", "QUOTED", false),
  order("wo-260208-0004", "c-1004", "eq-9005", "QUOTED", false),
  order("wo-260208-0005", "c-1001", "eq-9002", "APPROVED", true),
  order("wo-260207-0006", "c-1002", "eq-9003", "IN_PROGRESS", true),
  order("wo-260207-0007", "c-1003", "eq-9004", "IN_PROGRESS", true),
  order("wo-260206-0008", "c-1004", "eq-9005", "VERIFIED", true),
  order("wo-260205-0009", "c-1001", "eq-9001", "CLOSED", true),
  order("wo-260204-0010", "c-1002", "eq-9003", "CLOSED", true),
];

const members = [
  { userSub: "admin@taller.cr", role: "ADMIN", status: "active", createdAt: "2026-01-10T08:00:00Z" },
  { userSub: "tecnico@taller.cr", role: "OPERATOR", status: "active", createdAt: "2026-02-03T08:00:00Z" },
  { userSub: "auditor@taller.cr", role: "AUDITOR_READONLY", status: "active", createdAt: "2026-03-15T08:00:00Z" },
];

const auditEvents = [
  { id: "ev-1", actorId: "tecnico@taller.cr", action: "work_order.diagnosis_saved", resource: "wo-260209-0002", createdAt: "2026-11-21T14:10:00Z" },
  { id: "ev-2", actorId: "admin@taller.cr", action: "work_order.approved", resource: "wo-260208-0005", createdAt: "2026-11-21T13:42:00Z" },
  { id: "ev-3", actorId: "tecnico@taller.cr", action: "work_order.received", resource: "wo-260210-0001", createdAt: "2026-11-21T11:05:00Z" },
  { id: "ev-4", actorId: "sistema", action: "migration.run_completed", resource: "run-demo-01", createdAt: "2026-11-20T18:22:00Z" },
];

const provenanceEntries = [
  { id: "pv-1", fieldPath: "customer.legalName", originKind: "CSV", transformationId: "tr-csv-01", ruleVersion: "v2", artifactId: "art-1", artifactName: "clientes-importados.csv", sourceLocator: "fila 14", createdAt: "2026-11-20T18:00:00Z" },
  { id: "pv-2", fieldPath: "equipment.serialNumber", originKind: "XLSX", transformationId: "tr-xlsx-02", ruleVersion: "v1", artifactId: "art-2", artifactName: "equipos-taller.xlsx", sourceLocator: "fila 31", createdAt: "2026-11-20T18:00:00Z" },
];

const cabys = [
  { codigo: "8415109010100", descripcion: "Acondicionadores de aire de pared, splits" },
  { codigo: "8415900000000", descripcion: "Partes y accesorios para acondicionadores de aire" },
  { codigo: "8418610000000", descripcion: "Bombas de calor" },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function findOrder(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}

export function installDevMock(): void {
  if (!import.meta.env.DEV) return;
  if (!new URLSearchParams(window.location.search).has("mock")) return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("/api/")) return nativeFetch(input as RequestInfo, init);

    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.split("/api/")[1] ?? "";
    const parts = path.split("?")[0]!.split("/").filter(Boolean);
    const segment = (index: number) => parts[index] ?? "";

    if (segment(0) === "v1") parts.shift();
    const r = parts.filter((p) => p !== "v1");
    const s = (index: number) => r[index] ?? "";

    if (s(0) === "work-orders") {
      const id = s(1);
      const action = s(2);
      if (!id && method === "GET") return json({ ok: true, workOrders: orders });
      if (!id && method === "POST") {
        const created = order(`wo-260211-${String(orders.length + 1).padStart(4, "0")}`, "c-1001", "eq-9001", "RECEIVED", false);
        orders.unshift(created);
        return json({ ok: true, workOrder: created });
      }
      const found = findOrder(id);
      if (!found) return json({ ok: false, error: { code: "ERR_NOT_FOUND", message: "Orden no encontrada." } }, 404);
      if (!action && method === "GET") return json({ ok: true, workOrder: found });
      if (action === "transition" && method === "PATCH") {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { targetStatus?: string };
        if (body.targetStatus === "IN_PROGRESS" && !found.customerAuthorized) {
          return json({ ok: false, error: { code: "ERR_WORK_ORDER_APPROVAL_REQUIRED", message: "Falta la aprobación del cliente." } }, 409);
        }
        found.status = body.targetStatus ?? found.status;
        found.version += 1;
        return json({ ok: true, workOrder: found });
      }
      if (action === "approvals" && method === "POST") {
        found.customerAuthorized = true;
        found.status = "APPROVED";
        found.version += 1;
        return json({ ok: true, workOrder: found });
      }
      if (action === "diagnosis" && method === "POST") {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { notes?: string };
        found.diagnoses = [{ id: `dx-${found.id}`, notes: body.notes ?? "", measurements: { succionPsi: 68 }, attachments: [] }];
        if (found.status === "RECEIVED") found.status = "DIAGNOSED";
        found.version += 1;
        return json({ ok: true, workOrder: found });
      }
      if (action === "materials" && method === "POST") {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { cabysCode?: string; quantity?: string; unitPriceMinor?: number };
        found.materials = [
          ...(found.materials ?? []),
          { cabysCode: body.cabysCode ?? "8415109010100", quantity: body.quantity ?? "1", unitPriceMinor: String(body.unitPriceMinor ?? 150000), taxRateBps: 1300 },
        ];
        if (found.status === "DIAGNOSED") found.status = "QUOTED";
        found.version += 1;
        return json({ ok: true, workOrder: found });
      }
      if (action === "close" && method === "POST") {
        found.status = "CLOSED";
        found.fiscalIntentId = "fi-demo-9981";
        return json({ ok: true, fiscalIntentId: found.fiscalIntentId });
      }
      if (action === "attachments" && method === "POST") return json({ attachmentId: "att-demo-01" });
      if (action === "sync" && method === "POST") return json({ ok: true });
    }

    if (s(0) === "customers" && method === "GET") {
      const customerId = s(1);
      const action = s(2);
      if (!customerId) return json({ ok: true, customers });
      if (action === "equipment") return json({ ok: true, equipment: equipmentByCustomer[customerId] ?? [] });
      if (action === "provenance") return json({ ok: true, provenance: { entityId: customerId, entries: provenanceEntries } });
    }

    if (s(0) === "catalog" && s(1) === "cabys") {
      return json({ ok: true, query: "aire", data: { cabys }, meta: { fromCache: true, source: "mock" } });
    }

    if (s(0) === "billing" && s(1) === "usage") {
      return json({ ok: true, billing: { planCode: "starter", status: "active", usage: { seats: 4 }, limits: { maxSeats: 5 } } });
    }

    if (s(0) === "audit") return json({ ok: true, events: auditEvents });

    if (s(0) === "fiscal" && s(1) === "credentials") {
      if (s(2) === "promote") return json({ ok: true, activeEnvironment: "production" });
      if (method === "GET") {
        return json({ ok: true, credentials: [{ issuerId: "3-101-555443", environment: "sandbox", kind: "PKCS12", certNotAfter: "2027-06-30T00:00:00Z", updatedAt: "2026-11-18T10:00:00Z" }] });
      }
      return json({ ok: true, environment: "sandbox", issuerId: "3-101-555443", certNotAfter: "2027-06-30T00:00:00Z" });
    }

    if (s(0) === "org" && s(1) === "members" && method === "GET") return json({ ok: true, members });
    if (s(0) === "org" && s(1) === "register") return json({ ok: true, organization: { tenantId: TENANT } });
    if (s(0) === "invitations" && s(1) === "accept") return json({ ok: true });
    if (s(0) === "invitations") return json({ ok: true, invitation: { token: "demo-invite-token", expiresAt: "2026-12-31T00:00:00Z" } });

    if (s(0) === "migrations") {
      if (s(2) === "uploads" || (s(1) && s(2) === undefined && method === "POST")) return json({ runId: "run-demo-01" });
      if (s(1) === "uploads") return json({ runId: "run-demo-01" });
      if (s(2) === "profile") return json({ needsReview: [{ column: "cedula", confidence: 0.62 }] });
      if (s(2) === "conflicts") return json({ conflicts: [{ id: "cf-1", summary: "Cédula duplicada con dos razones sociales", status: "NEEDS_REVIEW" }] });
      if (s(2) === "decisions") return json({ ok: true });
      if (s(2) === "resume") return json({ status: "completada" });
    }

    if (s(0) === "healthz" || s(0) === "readyz") return json({ ok: true, service: "oficios" });

    return json({ ok: false, error: { code: "ERR_MOCK_UNHANDLED", message: `Ruta mock no implementada: ${path}` } }, 404);
  };
}
