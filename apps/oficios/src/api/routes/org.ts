import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  RegisterOrganizationBodySchema,
  UpdateMemberRoleBodySchema,
} from "@quimera/core";

import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "../../domain/hvac-refrigeration-v1.js";
import type { BootstrapAppEnv } from "../middleware/bootstrap-context.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";
import {
  ERR_FORBIDDEN,
  ERR_LAST_ADMIN,
  ERR_NOT_FOUND,
  ERR_VALIDATION,
  errorResponse,
} from "../errors.js";
import { buildTenantExport } from "../services/saas-export.js";
import {
  listActiveMembers,
  removeMember,
  updateMemberRole,
} from "../services/saas-members.js";
import {
  loadOrganizationProfile,
  provisionOrganization,
  setOrganizationSuspended,
} from "../services/saas-org.js";

export function createOrgRegisterRoute() {
  const app = new Hono<BootstrapAppEnv>();

  app.post("/register", async (c) => {
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

    const parsed = RegisterOrganizationBodySchema.safeParse(body);
    if (!parsed.success) {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Datos de organización inválidos.",
        { issues: parsed.error.flatten() },
      );
      return c.json(err, status);
    }

    if (parsed.data.tradeContractId !== HVAC_REFRIGERATION_V1_CONTRACT_ID) {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Perfil de oficio no soportado.",
      );
      return c.json(err, status);
    }

    const result = await provisionOrganization(
      c.get("sql") as Sql,
      c.get("actorId"),
      parsed.data,
    );

    if (!result.ok) {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Identificación fiscal costarricense inválida.",
      );
      return c.json(err, status);
    }

    return c.json({ ok: true, organization: result.organization }, 201);
  });

  return app;
}

export function createOrgRoutes() {
  const app = new Hono<OficiosAppEnv>();

  app.get("/", async (c) => {
    const profile = await loadOrganizationProfile(c.get("sql"), c.get("tenantId"));
    if (!profile) {
      const { status, body } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Organización no encontrada.",
      );
      return c.json(body, status);
    }
    return c.json({ ok: true, organization: profile });
  });

  app.get("/export", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede exportar datos del tenant.",
      );
      return c.json(body, status);
    }
    const bundle = await buildTenantExport(c.get("sql"), c.get("tenantId"));
    if (!bundle) {
      const { status, body } = errorResponse(
        404,
        ERR_NOT_FOUND,
        "VALIDATION",
        "Organización no encontrada.",
      );
      return c.json(body, status);
    }
    return c.json({ ok: true, export: bundle });
  });

  app.post("/suspend", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede suspender la organización.",
      );
      return c.json(body, status);
    }
    await setOrganizationSuspended(c.get("sql"), c.get("tenantId"));
    return c.json({ ok: true, status: "suspended" });
  });

  app.get("/members", async (c) => {
    const members = await listActiveMembers(c.get("sql"), c.get("tenantId"));
    return c.json({ ok: true, members });
  });

  app.patch("/members/:userSub", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede gestionar roles.",
      );
      return c.json(body, status);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Cuerpo JSON inválido.",
      );
      return c.json(err, status);
    }

    const parsed = UpdateMemberRoleBodySchema.safeParse(payload);
    if (!parsed.success) {
      const { status, body: err } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Rol inválido.",
      );
      return c.json(err, status);
    }

    const userSub = decodeURIComponent(c.req.param("userSub"));
    const result = await updateMemberRole(
      c.get("sql"),
      c.get("tenantId"),
      userSub,
      parsed.data.role,
    );
    if (result.ok) {
      return c.json({ ok: true });
    }
    if (result.reason === "last_admin") {
      const { status, body } = errorResponse(
        409,
        ERR_LAST_ADMIN,
        "CONFLICT",
        "No se puede degradar ni remover al último ADMIN activo.",
      );
      return c.json(body, status);
    }
    const { status, body } = errorResponse(
      404,
      ERR_NOT_FOUND,
      "VALIDATION",
      "Miembro no encontrado.",
    );
    return c.json(body, status);
  });

  app.delete("/members/:userSub", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede remover miembros.",
      );
      return c.json(body, status);
    }

    const userSub = decodeURIComponent(c.req.param("userSub"));
    const result = await removeMember(c.get("sql"), c.get("tenantId"), userSub);
    if (result.ok) {
      return c.json({ ok: true });
    }
    if (result.reason === "last_admin") {
      const { status, body } = errorResponse(
        409,
        ERR_LAST_ADMIN,
        "CONFLICT",
        "No se puede degradar ni remover al último ADMIN activo.",
      );
      return c.json(body, status);
    }
    const { status, body } = errorResponse(
      404,
      ERR_NOT_FOUND,
      "VALIDATION",
      "Miembro no encontrado.",
    );
    return c.json(body, status);
  });

  return app;
}