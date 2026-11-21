import { Hono } from "hono";

import {
  assessPkcs12Upload,
  evaluatePromoteToProduction,
  listFiscalCredentialMetadata,
  productionCertificateIsValid,
  promoteIssuerToProduction,
  readIssuerActiveEnvironment,
  redactFiscalSecrets,
  upsertFiscalCredentials,
  type FiscalCredentialEnvironment,
} from "@quimera/fiscal-outbox";

import { ERR_FORBIDDEN, ERR_VALIDATION, errorResponse } from "../errors.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";
import { oficiosFiscalVault } from "../services/fiscal-vault.js";

type CredentialBody = {
  readonly issuerId?: string;
  readonly environment?: FiscalCredentialEnvironment;
  readonly p12Base64?: string;
  readonly pin?: string;
  readonly idpUsername?: string;
  readonly idpPassword?: string;
  readonly certNotAfter?: string;
};

type PromoteBody = {
  readonly issuerId?: string;
};

function sanitizeMessage(message: string): string {
  return redactFiscalSecrets(message);
}

export function createFiscalCredentialsRoutes() {
  const app = new Hono<OficiosAppEnv>();

  app.get("/", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede consultar credenciales fiscales.",
      );
      return c.json(body, status);
    }
    const rows = await listFiscalCredentialMetadata(c.get("sql"), c.get("tenantId"));
    return c.json({
      ok: true,
      credentials: rows.map((row) => ({
        issuerId: row.issuerId,
        environment: row.environment,
        kind: row.kind,
        certNotAfter: row.certNotAfter?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  });

  app.post("/", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede cargar certificados fiscales.",
      );
      return c.json(body, status);
    }

    let payload: CredentialBody;
    try {
      payload = (await c.req.json()) as CredentialBody;
    } catch {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Cuerpo JSON inválido.",
      );
      return c.json(body, status);
    }

    const issuerId = payload.issuerId?.trim();
    const environment = payload.environment;
    const p12Base64 = payload.p12Base64?.trim();
    const pin = payload.pin;
    const idpUsername = payload.idpUsername?.trim();
    const idpPassword = payload.idpPassword;
    const certNotAfterRaw = payload.certNotAfter?.trim();

    if (
      !issuerId ||
      (environment !== "sandbox" && environment !== "production") ||
      !p12Base64 ||
      !pin ||
      !idpUsername ||
      !idpPassword ||
      !certNotAfterRaw
    ) {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        sanitizeMessage("Faltan issuerId, environment, p12Base64, pin, idpUsername, idpPassword o certNotAfter."),
      );
      return c.json(body, status);
    }

    let p12: Buffer;
    try {
      p12 = Buffer.from(p12Base64, "base64");
    } catch {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "p12Base64 no es base64 válido.",
      );
      return c.json(body, status);
    }

    const certNotAfter = new Date(certNotAfterRaw);
    if (Number.isNaN(certNotAfter.getTime())) {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "certNotAfter no es una fecha ISO válida.",
      );
      return c.json(body, status);
    }

    const assessed = assessPkcs12Upload({ bytes: p12, notAfter: certNotAfter });
    if (!assessed.accepted) {
      const { status, body } = errorResponse(
        400,
        assessed.reason ?? ERR_VALIDATION,
        "VALIDATION",
        sanitizeMessage(`Certificado rechazado: ${assessed.reason ?? "ERR_P12_INVALID"}`),
      );
      return c.json(body, status);
    }

    const result = await upsertFiscalCredentials(c.get("sql"), oficiosFiscalVault, {
      tenantId: c.get("tenantId"),
      issuerId,
      environment,
      p12,
      pin,
      idpUsername,
      idpPassword,
      certNotAfter,
    });

    return c.json({
      ok: true,
      issuerId: result.issuerId,
      environment: result.environment,
      certNotAfter: result.certNotAfter,
      expiresWithin30Days: result.expiresWithin30Days,
    });
  });

  app.post("/promote", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede promover a producción.",
      );
      return c.json(body, status);
    }

    let payload: PromoteBody;
    try {
      payload = (await c.req.json()) as PromoteBody;
    } catch {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Cuerpo JSON inválido.",
      );
      return c.json(body, status);
    }

    const issuerId = payload.issuerId?.trim();
    if (!issuerId) {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "issuerId es obligatorio.",
      );
      return c.json(body, status);
    }

    const productionCertificateValid = await productionCertificateIsValid(
      c.get("sql"),
      c.get("tenantId"),
      issuerId,
    );

    const gate = await evaluatePromoteToProduction(c.get("sql"), {
      tenantId: c.get("tenantId"),
      issuerId,
      productionCertificateValid,
      adminConfirmed: true,
    });

    if (!gate.ok) {
      const { status, body } = errorResponse(
        409,
        "ERR_PROMOTION_BLOCKED",
        "CONFLICT",
        gate.reason,
      );
      return c.json(body, status);
    }

    await promoteIssuerToProduction(c.get("sql"), c.get("tenantId"), issuerId);
    const active = await readIssuerActiveEnvironment(c.get("sql"), c.get("tenantId"), issuerId);

    return c.json({
      ok: true,
      issuerId,
      activeEnvironment: active,
    });
  });

  return app;
}