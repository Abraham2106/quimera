import { randomUUID } from "node:crypto";

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
import { handleBillingWebhook, createBillingUsageRoute } from "./routes/billing.js";
import { listAuditLogs } from "./services/audit-log.js";
import { errorResponse } from "./errors.js";

export type CreateAppOptions = {
  readonly sql?: Sql;
};

export function createApp(options: CreateAppOptions = {}): Hono<OficiosAppEnv> {
  const sql = options.sql;
  const app = new Hono<OficiosAppEnv>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? randomUUID();
    c.header("x-request-id", requestId);
    await next();
  });

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

  app.get("/healthz", (c) => c.json({ ok: true, live: true }));
  app.get("/readyz", async (c) => {
    if (!sql) {
      return c.json({ ok: false, ready: false, database: "unavailable" }, 503);
    }
    try {
      await sql`SELECT 1`;
      const role = await sql<{ rolsuper: boolean }[]>`
        SELECT rolsuper FROM pg_roles WHERE rolname = current_user
      `;
      if (role[0]?.rolsuper === true) {
        return c.json({ ok: false, ready: false, database: "unavailable" }, 503);
      }
      return c.json({ ok: true, ready: true, database: "up" });
    } catch {
      return c.json({ ok: false, ready: false, database: "unavailable" }, 503);
    }
  });

  const tenantContext = createRequestContextMiddleware({ sql });
  app.use("*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === "/healthz" || path === "/readyz") {
      await next();
      return;
    }
    if (path === "/api/v1/billing/webhooks") {
      return handleBillingWebhook(c, sql);
    }
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
  app.get("/api/v1/billing/usage", createBillingUsageRoute());
  app.get("/api/v1/audit", async (c) => {
    if (c.get("role") !== "ADMIN" && c.get("role") !== "AUDITOR_READONLY") {
      const { status, body } = errorResponse(403, "ERR_FORBIDDEN", "SECURITY", "La bitácora no está disponible para este rol.");
      return c.json(body, status);
    }
    const rows = await listAuditLogs(c.get("sql"), c.get("tenantId"));
    return c.json({
      ok: true,
      events: rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        action: row.action,
        resource: row.resource,
        createdAt: row.created_at.toISOString(),
      })),
    });
  });

  return app;
}