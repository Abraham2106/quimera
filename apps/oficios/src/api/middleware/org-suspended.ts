import { createMiddleware } from "hono/factory";

import { ERR_ORG_SUSPENDED, errorResponse } from "../errors.js";
import { loadOrganizationStatus } from "../services/saas-org.js";
import type { OficiosAppEnv } from "./request-context.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const SUSPENSION_BYPASS_PATHS = [
  /^\/api\/v1\/health$/,
  /^\/api\/v1\/org\/register$/,
  /^\/api\/v1\/invitations\/accept$/,
  /^\/api\/v1\/org\/export$/,
  /^\/api\/v1\/org$/,
  /^\/api\/v1\/org\/members$/,
];

function pathBypassesSuspension(path: string): boolean {
  return SUSPENSION_BYPASS_PATHS.some((re) => re.test(path));
}

const BOOTSTRAP_PATHS = new Set([
  "/api/v1/org/register",
  "/api/v1/invitations/accept",
]);

export const blockOperationalWhenSuspended = createMiddleware<OficiosAppEnv>(
  async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (BOOTSTRAP_PATHS.has(path)) {
      await next();
      return;
    }

    if (!MUTATION_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    if (pathBypassesSuspension(path)) {
      await next();
      return;
    }

    const status = await loadOrganizationStatus(c.get("sql"), c.get("tenantId"));
    if (status === "suspended") {
      const { status: httpStatus, body } = errorResponse(
        403,
        ERR_ORG_SUSPENDED,
        "SECURITY",
        "La organización está suspendida; las mutaciones operativas no están permitidas.",
      );
      return c.json(body, httpStatus);
    }

    await next();
  },
);