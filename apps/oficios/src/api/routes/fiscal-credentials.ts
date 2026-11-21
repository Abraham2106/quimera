import { createHash } from "node:crypto";

import { Hono } from "hono";

import { assessPkcs12Upload, assertCanPromoteToProduction } from "@quimera/fiscal-outbox";

import { ERR_FORBIDDEN, ERR_VALIDATION, errorResponse } from "../errors.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";

type StoredCertificate = {
  readonly fingerprint: string;
  readonly environment: "sandbox" | "production";
};

const certificates = new Map<string, StoredCertificate>();

export function resetFiscalCredentialStore(): void {
  certificates.clear();
}

export function createFiscalCredentialsRoutes() {
  const app = new Hono<OficiosAppEnv>();

  app.post("/credentials", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede cargar credenciales fiscales.",
      );
      return c.json(body, status);
    }
    const form = await c.req.formData();
    const file = form.get("file");
    const pin = form.get("pin");
    if (!(file instanceof File) || typeof pin !== "string" || pin.trim().length < 4) {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "Adjunte un certificado .p12 y un PIN de al menos 4 caracteres.",
      );
      return c.json(body, status);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const assessment = assessPkcs12Upload({
      bytes,
      notAfter: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000),
    });
    if (!assessment.accepted) {
      const { status, body } = errorResponse(
        400,
        ERR_VALIDATION,
        "VALIDATION",
        "El certificado no es un PKCS#12 válido.",
      );
      return c.json(body, status);
    }
    const fingerprint = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    certificates.set(c.get("tenantId"), { fingerprint, environment: "sandbox" });
    return c.json({
      ok: true,
      environment: "sandbox",
      fingerprint,
      expiresWithin30Days: assessment.expiresWithin30Days,
    });
  });

  app.post("/credentials/promote", async (c) => {
    if (c.get("role") !== "ADMIN") {
      const { status, body } = errorResponse(
        403,
        ERR_FORBIDDEN,
        "SECURITY",
        "Solo un ADMIN puede promover el emisor.",
      );
      return c.json(body, status);
    }
    const current = certificates.get(c.get("tenantId"));
    const decision = assertCanPromoteToProduction({
      sandboxAccepted: false,
      productionCertificateValid: Boolean(current),
      adminConfirmed: true,
    });
    if (!decision.ok) {
      const { status, body } = errorResponse(409, "ERR_QG07", "VALIDATION", decision.reason);
      return c.json(body, status);
    }
    return c.json({ ok: true, environment: "production" });
  });

  app.get("/credentials", (c) => {
    const current = certificates.get(c.get("tenantId"));
    return c.json({
      ok: true,
      environment: current?.environment ?? "sandbox",
      fingerprint: current?.fingerprint ?? null,
      note: "La verificación local no equivale a aceptación del Ministerio de Hacienda.",
    });
  });

  return app;
}
