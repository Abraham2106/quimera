import { createMiddleware } from "hono/factory";

import { ERR_FORBIDDEN, errorResponse } from "../errors.js";
import type { OficiosAppEnv } from "./request-context.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const requireMutationRole = createMiddleware<OficiosAppEnv>(async (c, next) => {
  if (!MUTATION_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  if (c.get("role") === "AUDITOR_READONLY") {
    const { status, body } = errorResponse(
      403,
      ERR_FORBIDDEN,
      "SECURITY",
      "El rol AUDITOR_READONLY no puede ejecutar mutaciones.",
    );
    return c.json(body, status);
  }

  await next();
});