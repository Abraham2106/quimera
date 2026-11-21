import { Hono } from "hono";

import { ERR_NOT_FOUND, errorResponse } from "../errors.js";
import { loadCustomerProvenance } from "../services/provenance.js";
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