import { Hono } from "hono";

import {
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
} from "../../domain/work-order-status.js";
import {
  ERR_NOT_FOUND,
  ERR_TENANT_MISMATCH,
  ERR_VALIDATION,
  errorResponse,
} from "../errors.js";
import {
  AttachmentRejected,
  readDiagnosisAttachment,
  storeDiagnosisAttachment,
} from "../services/diagnosis-attachments.js";
import { closeWorkOrderWithFiscalIntent } from "../services/fiscal-close.js";
import { applyOfflineMutation, SyncConflict } from "../services/offline-sync.js";
import {
  applyWorkOrderTransition,
  createWorkOrderReceived,
  loadWorkOrderForTenant,
  registerCustomerApproval,
  serializeWorkOrder,
} from "../services/work-order-store.js";
import {
  listDiagnoses,
  listMaterials,
  listWorkOrders,
  loadWorkOrderContext,
  saveDiagnosis,
  saveMaterial,
  taxRateToBps,
} from "../services/workshop.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";

function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return (WORK_ORDER_STATUSES as readonly string[]).includes(value);
}

function rejectBodyTenantMismatch(
  body: Record<string, unknown> | null | undefined,
  tenantId: string,
): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  const bodyTenant = body.tenantId;
  if (typeof bodyTenant === "string" && bodyTenant !== tenantId) {
    return true;
  }
  return false;
}

export function createWorkOrdersRoutes() {
  const app = new Hono<OficiosAppEnv>();

  app.get("/", async (c) => {
    const rows = await listWorkOrders(c.get("sql"), c.get("tenantId"));
    return c.json({ ok: true, workOrders: rows.map(serializeWorkOrder) });
  });

  app.get("/:id", async (c) => {
    const workOrderId = c.req.param("id");
    const row = await loadWorkOrderForTenant(c.get("sql"), c.get("tenantId"), workOrderId);
    if (!row) {
      const { status, body } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Orden de trabajo no encontrada.",
      );
      return c.json(body, status);
    }
    const context = await loadWorkOrderContext(c.get("sql"), c.get("tenantId"), workOrderId);
    const diagnoses = await listDiagnoses(c.get("sql"), c.get("tenantId"), workOrderId);
    const materials = await listMaterials(c.get("sql"), c.get("tenantId"), workOrderId);
    return c.json({
      ok: true,
      workOrder: {
        ...serializeWorkOrder(row),
        customerLegalName: context?.customerLegalName ?? null,
        equipmentSerial: context?.equipmentSerial ?? null,
        diagnoses,
        materials,
      },
    });
  });

  app.post("/:id/attachments", async (c) => {
    const workOrderId = c.req.param("id");
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      const { status, body: errBody } = errorResponse(400, ERR_VALIDATION, "VALIDATION", "Adjuntá un archivo en el campo file.");
      return c.json(errBody, status);
    }
    try {
      const stored = await storeDiagnosisAttachment(c.get("sql"), c.get("tenantId"), workOrderId, {
        name: file.name,
        mime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      return c.json({ ok: true, ...stored }, 201);
    } catch (error) {
      if (error instanceof AttachmentRejected) {
        const { status, body: errBody } = errorResponse(
          error.status,
          error.code,
          "VALIDATION",
          error.message,
        );
        return c.json(errBody, status);
      }
      throw error;
    }
  });

  app.get("/:id/attachments/:attachmentId", async (c) => {
    const file = await readDiagnosisAttachment(
      c.get("sql"),
      c.get("tenantId"),
      c.req.param("id"),
      c.req.param("attachmentId"),
    );
    if (!file) {
      const { status, body: errBody } = errorResponse(404, ERR_NOT_FOUND, "VALIDATION", "Adjunto no encontrado.");
      return c.json(errBody, status);
    }
    return new Response(file.bytes, {
      status: 200,
      headers: { "content-type": file.mime },
    });
  });

  app.post("/:id/sync", async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    try {
      const result = await applyOfflineMutation(c.get("sql"), c.get("tenantId"), c.req.param("id"), {
        clientMutationId: typeof body.clientMutationId === "string" ? body.clientMutationId : undefined,
        expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
        kind: typeof body.kind === "string" ? body.kind : undefined,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        measurements:
          body.measurements && typeof body.measurements === "object"
            ? (body.measurements as Record<string, unknown>)
            : undefined,
        cabysCode: typeof body.cabysCode === "string" ? body.cabysCode : undefined,
        quantity: typeof body.quantity === "string" ? body.quantity : undefined,
        unitPriceMinor: typeof body.unitPriceMinor === "number" ? body.unitPriceMinor : undefined,
        taxRate: typeof body.taxRate === "string" ? body.taxRate : undefined,
      });
      return c.json(result, 200);
    } catch (error) {
      if (error instanceof SyncConflict) {
        const { status, body: errBody } = errorResponse(
          error.status,
          error.code,
          error.status === 409 ? "CONFLICT" : "VALIDATION",
          error.message,
          error.details,
        );
        return c.json(errBody, status);
      }
      throw error;
    }
  });

  app.post("/:id/diagnosis", async (c) => {
    const workOrderId = c.req.param("id");
    const body = await c.req.json<{
      notes?: string;
      measurements?: Record<string, unknown>;
      attachments?: Array<{ filename?: string; sha256?: string; contentBase64?: string }>;
    }>();
    const row = await loadWorkOrderForTenant(c.get("sql"), c.get("tenantId"), workOrderId);
    if (!row) {
      const { status, body: errBody } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Orden de trabajo no encontrada.",
      );
      return c.json(errBody, status);
    }
    if (!body.notes || body.notes.trim().length === 0) {
      const { status, body: errBody } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "notes es obligatorio.",
      );
      return c.json(errBody, status);
    }
    try {
      const diagnosis = await saveDiagnosis(c.get("sql"), c.get("tenantId"), workOrderId, {
        notes: body.notes.trim(),
        measurements: body.measurements ?? {},
        attachments: (body.attachments ?? []).map((attachment) => ({
          filename: attachment.filename ?? "adjunto.bin",
          sha256: attachment.sha256 ?? "",
          contentBase64: attachment.contentBase64 ?? "",
        })),
      });
      return c.json({ ok: true, diagnosis }, 201);
    } catch (err) {
      if (err instanceof Error && err.message === "ERR_ATTACHMENT_SHA256") {
        const { status, body: errBody } = errorResponse(
          400,
          ERR_VALIDATION,
          "VALIDATION",
          "El SHA-256 del adjunto no coincide con el contenido.",
        );
        return c.json(errBody, status);
      }
      throw err;
    }
  });

  app.post("/:id/materials", async (c) => {
    const workOrderId = c.req.param("id");
    const body = await c.req.json<{
      cabysCode?: string;
      quantity?: string;
      unitPriceMinor?: number;
      taxRate?: string;
    }>();
    const row = await loadWorkOrderForTenant(c.get("sql"), c.get("tenantId"), workOrderId);
    if (!row) {
      const { status, body: errBody } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Orden de trabajo no encontrada.",
      );
      return c.json(errBody, status);
    }
    const taxRateBps = body.taxRate ? taxRateToBps(body.taxRate) : null;
    if (!body.cabysCode || !body.quantity || typeof body.unitPriceMinor !== "number" || taxRateBps === null) {
      const { status, body: errBody } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "cabysCode, quantity, unitPriceMinor y taxRate son obligatorios.",
      );
      return c.json(errBody, status);
    }
    try {
      const material = await saveMaterial(c.get("sql"), c.get("tenantId"), workOrderId, {
        cabysCode: body.cabysCode,
        quantity: body.quantity,
        unitPriceMinor: body.unitPriceMinor,
        taxRateBps,
      });
      return c.json({ ok: true, material }, 201);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("ERR_")) {
        const { status, body: errBody } = errorResponse(
          400,
          ERR_VALIDATION,
          "VALIDATION",
          "Material inválido: código CAByS, cantidad, precio entero o IVA.",
        );
        return c.json(errBody, status);
      }
      throw err;
    }
  });

  app.post("/", async (c) => {
    const body = await c.req.json<{
      customerId?: string;
      equipmentId?: string;
      tenantId?: string;
    }>();

    if (rejectBodyTenantMismatch(body, c.get("tenantId"))) {
      const { status, body: errBody } = errorResponse(
        400,
        ERR_TENANT_MISMATCH,
        "VALIDATION",
        "tenantId en el cuerpo no coincide con x-tenant-id.",
      );
      return c.json(errBody, status);
    }

    if (!body.customerId || !body.equipmentId) {
      const { status, body: errBody } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "customerId y equipmentId son obligatorios.",
      );
      return c.json(errBody, status);
    }

    try {
      const row = await createWorkOrderReceived(
        c.get("sql"),
        c.get("tenantId"),
        body.customerId,
        body.equipmentId,
        c.get("actorId"),
      );
      return c.json(
        { ok: true, workOrder: serializeWorkOrder(row) },
        201,
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : "ERR_INTERNAL";
      if (code === "CUSTOMER_NOT_FOUND" || code === "EQUIPMENT_NOT_FOUND") {
        const { status, body: errBody } = errorResponse(
          404,
          ERR_NOT_FOUND,
          "VALIDATION",
          "Cliente o equipo no encontrado en el tenant.",
        );
        return c.json(errBody, status);
      }
      throw err;
    }
  });

  app.patch("/:id/transition", async (c) => {
    const workOrderId = c.req.param("id");
    const body = await c.req.json<{
      targetStatus?: string;
      expectedVersion?: number;
      tenantId?: string;
    }>();

    if (rejectBodyTenantMismatch(body, c.get("tenantId"))) {
      const { status, body: errBody } = errorResponse(
        400,
        ERR_TENANT_MISMATCH,
        "VALIDATION",
        "tenantId en el cuerpo no coincide con x-tenant-id.",
      );
      return c.json(errBody, status);
    }

    if (
      !body.targetStatus ||
      !isWorkOrderStatus(body.targetStatus) ||
      typeof body.expectedVersion !== "number"
    ) {
      const { status, body: errBody } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "targetStatus y expectedVersion son obligatorios.",
      );
      return c.json(errBody, status);
    }

    try {
      const result = await applyWorkOrderTransition(c.get("sql"), {
        tenantId: c.get("tenantId"),
        workOrderId,
        targetStatus: body.targetStatus,
        expectedVersion: body.expectedVersion,
        actorId: c.get("actorId"),
      });

      if (!result.ok) {
        const { status, body: errBody } = result.response;
        return c.json(errBody, status);
      }

      return c.json({
        ok: true,
        workOrder: serializeWorkOrder(result.workOrder),
      });
    } catch (err) {
      if (err instanceof Error && err.message === "WORK_ORDER_NOT_FOUND") {
        const { status, body: errBody } = errorResponse(
          404,
          ERR_NOT_FOUND,
          "VALIDATION",
          "Orden de trabajo no encontrada.",
        );
        return c.json(errBody, status);
      }
      throw err;
    }
  });

  app.post("/:id/approvals", async (c) => {
    const workOrderId = c.req.param("id");
    const body = await c.req.json<{
      approverName?: string;
      tenantId?: string;
    }>();

    if (rejectBodyTenantMismatch(body, c.get("tenantId"))) {
      const { status, body: errBody } = errorResponse(
        400,
        ERR_TENANT_MISMATCH,
        "VALIDATION",
        "tenantId en el cuerpo no coincide con x-tenant-id.",
      );
      return c.json(errBody, status);
    }

    try {
      const result = await registerCustomerApproval(
        c.get("sql"),
        c.get("tenantId"),
        workOrderId,
        c.get("actorId"),
        body.approverName,
      );
      if (!result.ok) {
        const { status, body: errBody } = result.response;
        return c.json(errBody, status);
      }
      return c.json(
        { ok: true, workOrder: serializeWorkOrder(result.workOrder) },
        201,
      );
    } catch (err) {
      if (err instanceof Error && err.message === "WORK_ORDER_NOT_FOUND") {
        const { status, body: errBody } = errorResponse(
          404,
          ERR_NOT_FOUND,
          "VALIDATION",
          "Orden de trabajo no encontrada.",
        );
        return c.json(errBody, status);
      }
      throw err;
    }
  });

  app.post("/:id/close", async (c) => {
    const workOrderId = c.req.param("id");
    const body = (await c.req
      .json<{ expectedVersion?: number; tenantId?: string }>()
      .catch(() => ({}))) as { expectedVersion?: number; tenantId?: string };

    if (rejectBodyTenantMismatch(body, c.get("tenantId"))) {
      const { status, body: errBody } = errorResponse(
        400,
        ERR_TENANT_MISMATCH,
        "VALIDATION",
        "tenantId en el cuerpo no coincide con x-tenant-id.",
      );
      return c.json(errBody, status);
    }

    const outcome = await closeWorkOrderWithFiscalIntent(
      c.get("sql"),
      c.get("tenantId"),
      workOrderId,
      c.get("actorId"),
      body.expectedVersion,
    );

    if (!outcome.ok) {
      if (outcome.kind === "not_found") {
        const { status, body: errBody } = errorResponse(
          404,
          ERR_NOT_FOUND,
          "VALIDATION",
          "Orden de trabajo no encontrada.",
        );
        return c.json(errBody, status);
      }
      const { status, body: errBody } = outcome.response!;
      return c.json(errBody, status);
    }

    return c.json({ ok: true, ...outcome.result });
  });

  return app;
}