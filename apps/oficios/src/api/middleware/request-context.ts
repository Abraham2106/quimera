import { createMiddleware } from "hono/factory";

import {
  createOficiosPostgresClient,
  withOfiTenantTransaction,
} from "../../db/connection.js";
import {
  ERR_VALIDATION,
  errorResponse,
} from "../errors.js";
import {
  parseOficiosRole,
  type OficiosRole,
  type OficiosRequestContext,
} from "../context.js";
import type { Sql } from "postgres";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OficiosAppEnv = {
  Variables: OficiosRequestContext;
};

export type CreateRequestContextMiddlewareOptions = {
  readonly sql?: Sql;
  readonly defaultRole?: OficiosRole;
};

export function createRequestContextMiddleware(
  options: CreateRequestContextMiddlewareOptions = {},
) {
  const sql = options.sql ?? createOficiosPostgresClient();
  const defaultRole = options.defaultRole ?? "OPERATOR";

  return createMiddleware<OficiosAppEnv>(async (c, next) => {
    const tenantHeader = c.req.header("x-tenant-id");
    if (!tenantHeader || !UUID_RE.test(tenantHeader)) {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Cabecera x-tenant-id con UUID válido es obligatoria.",
      );
      return c.json(body, status);
    }

    const roleHeader = c.req.header("x-test-role");
    const role = parseOficiosRole(roleHeader) ?? defaultRole;
    if (roleHeader && !parseOficiosRole(roleHeader)) {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Cabecera x-test-role inválida.",
      );
      return c.json(body, status);
    }

    const actorId = c.req.header("x-actor-id") ?? "test-operator";

    c.set("tenantId", tenantHeader);
    c.set("role", role);
    c.set("actorId", actorId);

    await withOfiTenantTransaction(sql, tenantHeader, async (tx) => {
      c.set("sql", tx);
      await next();
    });
  });
}