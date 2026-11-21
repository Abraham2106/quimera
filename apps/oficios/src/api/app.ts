import { Hono } from "hono";
import type { Sql } from "postgres";

import { createCatalogRoutes } from "./routes/catalog.js";
import { createCustomersRoutes } from "./routes/customers.js";
import {
  createInvitationAcceptRoute,
  createInvitationsRoutes,
} from "./routes/invitations.js";
import { createOrgRegisterRoute, createOrgRoutes } from "./routes/org.js";
import { createMigrationRoutes } from "./routes/migrations.js";
import { createWorkOrdersRoutes } from "./routes/work-orders.js";
import {
  createBootstrapContextMiddleware,
} from "./middleware/bootstrap-context.js";
import { blockOperationalWhenSuspended } from "./middleware/org-suspended.js";
import {
  createRequestContextMiddleware,
  type OficiosAppEnv,
} from "./middleware/request-context.js";
import { requireMutationRole } from "./middleware/rbac.js";

export type CreateAppOptions = {
  readonly sql?: Sql;
};

export function createApp(options: CreateAppOptions = {}): Hono<OficiosAppEnv> {
  const sql = options.sql;
  const app = new Hono<OficiosAppEnv>();

  app.use(
    "/api/v1/org/register",
    createBootstrapContextMiddleware({ sql }),
  );
  app.route("/api/v1/org", createOrgRegisterRoute());

  app.use(
    "/api/v1/invitations/accept",
    createBootstrapContextMiddleware({ sql }),
  );
  app.route("/api/v1/invitations", createInvitationAcceptRoute());

  const tenantContext = createRequestContextMiddleware({ sql });
  app.use("*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (
      path === "/api/v1/org/register" ||
      path === "/api/v1/invitations/accept"
    ) {
      await next();
      return;
    }
    return tenantContext(c, next);
  });
  app.use("/api/v1/*", blockOperationalWhenSuspended);
  app.use("/api/v1/*", requireMutationRole);

  app.get("/api/v1/health", async (c) => {
    try {
      await c.get("sql")`SELECT 1`;
      return c.json({ ok: true, service: "oficios", database: "up" });
    } catch {
      return c.json({ ok: false, service: "oficios", database: "down" }, 503);
    }
  });

  app.route("/api/v1/org", createOrgRoutes());
  app.route("/api/v1/invitations", createInvitationsRoutes());
  app.route("/api/v1/work-orders", createWorkOrdersRoutes());
  app.route("/api/v1/migrations", createMigrationRoutes());
  app.route("/api/v1/customers", createCustomersRoutes());
  app.route("/api/v1/catalog", createCatalogRoutes());

  return app;
}