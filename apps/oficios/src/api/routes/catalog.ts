import { Hono } from "hono";

import { ERR_VALIDATION, errorResponse } from "../errors.js";
import { searchCabysCatalog } from "../services/cabys.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";

export function createCatalogRoutes() {
  const app = new Hono<OficiosAppEnv>();

  app.get("/cabys", async (c) => {
    const q = c.req.query("q");
    if (q === undefined) {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Parámetro q es obligatorio.",
      );
      return c.json(body, status);
    }

    const result = await searchCabysCatalog(q);
    return c.json(result);
  });

  return app;
}