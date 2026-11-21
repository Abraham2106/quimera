import { createHmac, randomBytes } from "node:crypto";

import type { OficiosRole } from "../../src/api/context.js";

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

export function createEphemeralJwtSecret(): string {
  return randomBytes(32).toString("base64url");
}

export type SignTestOficiosJwtInput = {
  readonly secret: string;
  readonly tenantId?: string;
  readonly role?: OficiosRole;
  readonly actorId: string;
  readonly expiresAtSec?: number;
};

export function signTestOficiosJwt(input: SignTestOficiosJwtInput): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const exp = input.expiresAtSec ?? now + 3600;
  const payload: Record<string, unknown> = {
    sub: input.actorId,
    exp,
    iat: now,
  };
  if (input.tenantId) {
    payload.tenant_id = input.tenantId;
  }
  if (input.role) {
    payload.role = input.role;
  }
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac("sha256", input.secret).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export function bearerAuthHeaders(
  token: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    ...extra,
  };
}