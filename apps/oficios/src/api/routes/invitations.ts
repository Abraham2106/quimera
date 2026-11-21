import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  AcceptInvitationBodySchema,
  CreateInvitationBodySchema,
} from "@quimera/core";

import type { BootstrapAppEnv } from "../middleware/bootstrap-context.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";
import {
  ERR_FORBIDDEN,
  ERR_INVITATION_CONFLICT,
  ERR_INVITATION_GONE,
  ERR_NOT_FOUND,
  ERR_VALIDATION,
  errorResponse,
} from "../errors.js";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "../services/saas-invitations.js";

export function createInvitationAcceptRoute() {
  const app = new Hono<BootstrapAppEnv>();

  app.post("/accept", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Cuerpo JSON inválido.",
      );
      return c.json(err, status);
    }

    const parsed = AcceptInvitationBodySchema.safeParse(body);
    if (!parsed.success) {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Token de invitación inválido.",
      );
      return c.json(err, status);
    }

    const result = await acceptInvitation(
      c.get("sql") as Sql,
      c.get("actorId"),
      parsed.data.token,
    );

    if (result.ok) {
      return c.json({
        ok: true,
        tenantId: result.tenantId,
        role: result.role,
      });
    }

    if (result.reason === "expired") {
      const { status, body } = errorResponse(
        410,
        ERR_INVITATION_GONE,
        "CONFLICT",
        "La invitación expiró.",
      );
      return c.json(body, status);
    }

    const { status, body: errBody } = errorResponse(
      409,
      ERR_INVITATION_CONFLICT,
      "CONFLICT",
      result.reason === "revoked"
        ? "La invitación fue revocada."
        : result.reason === "consumed"
          ? "La invitación ya fue utilizada."
          : "Invitación no encontrada.",
    );
    return c.json(errBody, status);
  });

  return app;
}

export function createInvitationsRoutes() {
  const app = new Hono<OficiosAppEnv>();

  app.post("/", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede crear invitaciones.",
      );
      return c.json(body, status);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Cuerpo JSON inválido.",
      );
      return c.json(err, status);
    }

    const parsed = CreateInvitationBodySchema.safeParse(body);
    if (!parsed.success) {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Datos de invitación inválidos.",
      );
      return c.json(err, status);
    }

    const created = await createInvitation(
      c.get("sql"),
      c.get("tenantId"),
      parsed.data,
    );

    return c.json(
      {
        ok: true,
        invitation: {
          id: created.id,
          expiresAt: created.expiresAt,
          role: created.role,
          token: created.token,
        },
      },
      201,
    );
  });

  app.delete("/:id", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede revocar invitaciones.",
      );
      return c.json(body, status);
    }

    const revoked = await revokeInvitation(
      c.get("sql"),
      c.get("tenantId"),
      c.req.param("id"),
    );
    if (!revoked) {
      const { status, body } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Invitación no encontrada o ya consumida.",
      );
      return c.json(body, status);
    }
    return c.json({ ok: true });
  });

  return app;
}