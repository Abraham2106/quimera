import { Hono } from "hono";

import { ERR_FORBIDDEN, ERR_NOT_FOUND, errorResponse } from "../errors.js";
import { loadCustomerProvenance } from "../services/provenance.js";
import { pseudonymizeCustomerContact } from "../services/pii-pseudonymize.js";
import { listCustomers, listEquipment } from "../services/workshop.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";

export function createCustomersRoutes() {
  const app = new Hono<OficiosAppEnv>();

  app.get("/", async (c) => {
    const customers = await listCustomers(c.get("sql"), c.get("tenantId"));
    return c.json({ ok: true, customers });
  });

  app.get("/:id/equipment", async (c) => {
    const customerId = c.req.param("id");
    const equipment = await listEquipment(c.get("sql"), c.get("tenantId"), customerId);
    if (equipment === "not_found") {
      const { status, body } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Cliente no encontrado.",
      );
      return c.json(body, status);
    }
    return c.json({ ok: true, equipment });
  });

  app.get("/:id", async (c) => {
    const customerId = c.req.param("id");
    const provenance = await loadCustomerProvenance(c.get("sql"), c.get("tenantId"), customerId);
    if (provenance === "not_found") {
      const { status, body } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Cliente no encontrado.",
      );
      return c.json(body, status);
    }
    const customers = await listCustomers(c.get("sql"), c.get("tenantId"));
    const customer = customers.find((item) => item.id === customerId);
    return c.json({ ok: true, customer, ...provenance });
  });

  app.post("/:id/pseudonymize", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede seudonimizar contacto.",
      );
      return c.json(body, status);
    }

    const customerId = c.req.param("id");
    const result = await pseudonymizeCustomerContact(
      c.get("sql"),
      c.get("tenantId"),
      customerId,
      c.get("actorId"),
    );

    if (result.status === "not_found") {
      const { status, body } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Cliente no encontrado.",
      );
      return c.json(body, status);
    }

    if (result.status === "active_work_orders") {
      const { status, body } = errorResponse(
        409,
        ERR_FORBIDDEN,
        "VALIDATION",
        "El contacto tiene órdenes activas; no se puede seudonimizar.",
      );
      return c.json(body, status);
    }

    return c.json({ ok: true, customerId: result.customerId });
  });

  app.get("/:id/provenance", async (c) => {
    const customerId = c.req.param("id");
    const payload = await loadCustomerProvenance(
      c.get("sql"),
      c.get("tenantId"),
      customerId,
    );

    if (payload === "not_found") {
      const { status, body } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Cliente no encontrado.",
      );
      return c.json(body, status);
    }

    return c.json({ ok: true, ...payload });
  });

  return app;
}