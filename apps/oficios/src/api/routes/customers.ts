import { Hono } from "hono";

import { ERR_NOT_FOUND, errorResponse } from "../errors.js";
import { loadCustomerProvenance } from "../services/provenance.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";

export function createCustomersRoutes() {
  const app = new Hono<OficiosAppEnv>();

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