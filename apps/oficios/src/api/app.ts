import { Hono } from "hono";
import type { Sql } from "postgres";

import { createCatalogRoutes } from "./routes/catalog.js";
import { createCustomersRoutes } from "./routes/customers.js";
import { createWorkOrdersRoutes } from "./routes/work-orders.js";
import {
  createRequestContextMiddleware,
  type OficiosAppEnv,
} from "./middleware/request-context.js";
import { requireMutationRole } from "./middleware/rbac.js";

export type CreateAppOptions = {
  readonly sql?: Sql;
};

export function createApp(options: CreateAppOptions = {}): Hono<OficiosAppEnv> {
  const app = new Hono<OficiosAppEnv>();

  app.use("*", createRequestContextMiddleware({ sql: options.sql }));
  app.use("/api/v1/*", requireMutationRole);

  app.get("/api/v1/health", async (c) => {
    try {
      await c.get("sql")`SELECT 1`;
      return c.json({ ok: true, service: "oficios", database: "up" });
    } catch {
      return c.json({ ok: false, service: "oficios", database: "down" }, 503);
    }
  });

  app.route("/api/v1/work-orders", createWorkOrdersRoutes());
  app.route("/api/v1/customers", createCustomersRoutes());
  app.route("/api/v1/catalog", createCatalogRoutes());

  return app;
}