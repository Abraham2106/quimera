import { createHmac, timingSafeEqual } from "node:crypto";

import { parseOficiosRole, type OficiosRole } from "../context.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VerifiedOficiosIdentity = {
  readonly tenantId: string;
  readonly role: OficiosRole;
  readonly actorId: string;
};

export type JwtVerifyOptions = {
  readonly secret: string;
  readonly issuer?: string;
  readonly audience?: string;
};

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function resolveJwtVerificationSecret(): string | null {
  const fromEnv = process.env.OFICIOS_JWT_SECRET?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

export type VerifiedBootstrapJwt = {
  readonly actorId: string;
  readonly tenantId: string | null;
  readonly role: OficiosRole | null;
};

function parseAndVerifyJwtPayload(
  token: string,
  options: JwtVerifyOptions,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }

  let header: { alg?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as {
      alg?: string;
    };
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }

  if (header.alg !== "HS256") {
    return null;
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac("sha256", options.secret).update(signingInput).digest();
  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(signatureB64, "base64url");
  } catch {
    return null;
  }
  if (!safeEqual(expectedSig, actualSig)) {
    return null;
  }

  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) {
    return null;
  }

  if (options.issuer) {
    if (payload.iss !== options.issuer) {
      return null;
    }
  }
  if (options.audience) {
    const aud = payload.aud;
    const audOk =
      aud === options.audience ||
      (Array.isArray(aud) && aud.includes(options.audience));
    if (!audOk) {
      return null;
    }
  }

  return payload;
}

export function verifiedClaimsFromPayload(
  payload: Record<string, unknown>,
): VerifiedBootstrapJwt | null {
  const tenantId = payload.tenant_id;
  const roleRaw = payload.role;
  const sub = payload.sub;

  if (typeof sub !== "string" || sub.trim().length === 0) {
    return null;
  }

  const tenantOk =
    typeof tenantId === "string" && UUID_RE.test(tenantId) ? tenantId : null;
  const role =
    typeof roleRaw === "string" ? parseOficiosRole(roleRaw) : null;

  return {
    actorId: sub.trim(),
    tenantId: tenantOk,
    role,
  };
}

export function verifyBearerJwt(
  token: string,
  options: JwtVerifyOptions,
): VerifiedOficiosIdentity | null {
  const payload = parseAndVerifyJwtPayload(token, options);
  if (!payload) {
    return null;
  }
  const claims = verifiedClaimsFromPayload(payload);
  if (!claims?.tenantId || !claims.role) {
    return null;
  }
  return {
    tenantId: claims.tenantId,
    role: claims.role,
    actorId: claims.actorId,
  };
}

export function verifyBearerJwtBootstrap(
  token: string,
  options: JwtVerifyOptions,
): VerifiedBootstrapJwt | null {
  const payload = parseAndVerifyJwtPayload(token, options);
  if (!payload) {
    return null;
  }
  return verifiedClaimsFromPayload(payload);
}

export function parseAuthorizationBearer(
  headerValue: string | undefined,
): string | null {
  if (!headerValue) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  if (!match?.[1]) {
    return null;
  }
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}