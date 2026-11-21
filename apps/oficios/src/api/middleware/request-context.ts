import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import {
  buildJwtVerifyOptions,
  jwtVerificationConfigured,
  parseAuthorizationBearer,
  verifyBearerJwtAsync,
} from "../auth/jwt.js";
import { testHeadersAuthAllowed } from "../auth/mode.js";
import {
  createOficiosPostgresClient,
  withOfiTenantTransaction,
} from "../../db/connection.js";
import {
  ERR_UNAUTHORIZED,
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

function unauthorized(c: Context<OficiosAppEnv>, message: string) {
  const { status, body } = errorResponse(
    401,
    ERR_UNAUTHORIZED,
    "SECURITY",
    message,
  );
  return c.json(body, status);
}

export function createRequestContextMiddleware(
  options: CreateRequestContextMiddlewareOptions = {},
) {
  const sql = options.sql ?? createOficiosPostgresClient();
  const defaultRole = options.defaultRole ?? "OPERATOR";

  return createMiddleware<OficiosAppEnv>(async (c, next) => {
  const allowTestHeaders = testHeadersAuthAllowed(c);

    if (allowTestHeaders) {
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
      return;
    }

    if (!jwtVerificationConfigured()) {
      return unauthorized(
        c,
        "Autenticación JWT no configurada (falta OFICIOS_JWT_SECRET u OFICIOS_JWKS_URL).",
      );
    }

    const hasSpoofHeaders =
      c.req.header("x-tenant-id") ||
      c.req.header("x-test-role") ||
      c.req.header("x-actor-id");

    const bearer = parseAuthorizationBearer(c.req.header("authorization"));
    if (!bearer) {
      return unauthorized(
        c,
        hasSpoofHeaders
          ? "Credenciales de prueba por cabecera no están permitidas; use Authorization Bearer."
          : "Token Bearer obligatorio.",
      );
    }

    const verified = await verifyBearerJwtAsync(bearer, buildJwtVerifyOptions());

    if (!verified) {
      return unauthorized(c, "Token inválido, expirado o con firma alterada.");
    }

    c.set("tenantId", verified.tenantId);
    c.set("role", verified.role);
    c.set("actorId", verified.actorId);

    await withOfiTenantTransaction(sql, verified.tenantId, async (tx) => {
      c.set("sql", tx);
      await next();
    });
  });
}