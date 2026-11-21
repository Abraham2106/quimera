import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { resolveBootstrapBearer } from "../auth/jwt-bootstrap.js";
import { testHeadersAuthAllowed } from "../auth/mode.js";
import { createOficiosPostgresClient } from "../../db/connection.js";
import { ERR_UNAUTHORIZED, ERR_VALIDATION, errorResponse } from "../errors.js";
import type { Sql } from "postgres";

export type BootstrapAppEnv = {
  Variables: {
    readonly actorId: string;
    readonly sql: Sql;
  };
};

function unauthorized(c: Context<BootstrapAppEnv>, message: string) {
  const { status, body } = errorResponse(
    401,
    ERR_UNAUTHORIZED,
    "SECURITY",
    message,
  );
  return c.json(body, status);
}

export type CreateBootstrapContextMiddlewareOptions = {
  readonly sql?: Sql;
};

export function createBootstrapContextMiddleware(
  options: CreateBootstrapContextMiddlewareOptions = {},
) {
  const sql = options.sql ?? createOficiosPostgresClient();

  return createMiddleware<BootstrapAppEnv>(async (c, next) => {
    const allowTestHeaders = testHeadersAuthAllowed(c);

    if (allowTestHeaders) {
      const actorId = c.req.header("x-actor-id")?.trim();
      if (!actorId) {
        const { status, body } = errorResponse(
          400,
          ERR_VALIDATION,
          "VALIDATION",
          "Cabecera x-actor-id obligatoria para registro.",
        );
        return c.json(body, status);
      }
      c.set("actorId", actorId);
      c.set("sql", sql);
      await next();
      return;
    }

    const verified = await resolveBootstrapBearer(c.req.header("authorization"));
    if (!verified) {
      return unauthorized(c, "Token Bearer válido con claim sub obligatorio.");
    }

    c.set("actorId", verified.actorId);
    c.set("sql", sql);
    await next();
  });
}