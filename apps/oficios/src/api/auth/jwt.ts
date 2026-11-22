import {
  createHmac,
  createPublicKey,
  createVerify,
  type KeyObject,
  timingSafeEqual,
} from "node:crypto";

import { parseOficiosRole, type OficiosRole } from "../context.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VerifiedOficiosIdentity = {
  readonly tenantId: string;
  readonly role: OficiosRole;
  readonly actorId: string;
};

export type JwtVerifyOptions = {
  readonly secret?: string;
  readonly jwksUrl?: string;
  readonly issuer?: string;
  readonly audience?: string;
};

type JwtHeader = {
  alg?: string;
  kid?: string;
};

type JwksDocument = {
  keys?: Array<Record<string, unknown>>;
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

export function resolveJwtJwksUrl(): string | null {
  const fromEnv = process.env.OFICIOS_JWKS_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

export function jwtVerificationConfigured(): boolean {
  return resolveJwtVerificationSecret() !== null || resolveJwtJwksUrl() !== null;
}

export function buildJwtVerifyOptions(): JwtVerifyOptions {
  return {
    secret: resolveJwtVerificationSecret() ?? undefined,
    jwksUrl: resolveJwtJwksUrl() ?? undefined,
    issuer: process.env.OFICIOS_JWT_ISSUER?.trim() || undefined,
    audience: process.env.OFICIOS_JWT_AUDIENCE?.trim() || undefined,
  };
}

export type VerifiedBootstrapJwt = {
  readonly actorId: string;
  readonly tenantId: string | null;
  readonly role: OficiosRole | null;
};

class JwksKeyCache {
  private readonly keys = new Map<string, KeyObject>();
  private loaded = false;

  constructor(private readonly jwksUrl: string) {}

  private ingest(document: JwksDocument): void {
    this.keys.clear();
    for (const entry of document.keys ?? []) {
      const kid = entry.kid;
      if (typeof kid !== "string" || kid.length === 0) {
        continue;
      }
      try {
        const key = createPublicKey({ key: entry, format: "jwk" });
        this.keys.set(kid, key);
      } catch {
        // ignore invalid JWK entries
      }
    }
    this.loaded = true;
  }

  private async fetchJwks(): Promise<void> {
    const response = await fetch(this.jwksUrl);
    if (!response.ok) {
      throw new Error("JWKS fetch failed");
    }
    const document = (await response.json()) as JwksDocument;
    this.ingest(document);
  }

  async resolveKey(kid: string): Promise<KeyObject | null> {
    if (!this.loaded) {
      await this.fetchJwks();
    }
    let key = this.keys.get(kid) ?? null;
    if (key) {
      return key;
    }
    await this.fetchJwks();
    key = this.keys.get(kid) ?? null;
    return key;
  }
}

let cachedJwks: JwksKeyCache | null = null;
let cachedJwksUrl: string | null = null;

function jwksCacheForUrl(jwksUrl: string): JwksKeyCache {
  if (cachedJwksUrl !== jwksUrl || !cachedJwks) {
    cachedJwks = new JwksKeyCache(jwksUrl);
    cachedJwksUrl = jwksUrl;
  }
  return cachedJwks;
}

export function resetJwtJwksCacheForTests(): void {
  cachedJwks = null;
  cachedJwksUrl = null;
}

function verifyHs256(
  signingInput: string,
  signatureB64: string,
  secret: string,
): boolean {
  const expectedSig = createHmac("sha256", secret).update(signingInput).digest();
  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(signatureB64, "base64url");
  } catch {
    return false;
  }
  return safeEqual(expectedSig, actualSig);
}

function verifyAsymmetricJwt(
  alg: "RS256" | "ES256",
  key: KeyObject,
  signingInput: string,
  signatureB64: string,
): boolean {
  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(signatureB64, "base64url");
  } catch {
    return false;
  }
  try {
    if (alg === "RS256") {
      return createVerify("RSA-SHA256").update(signingInput).verify(key, actualSig);
    }
    return createVerify("SHA256")
      .update(signingInput)
      .verify({ key, dsaEncoding: "ieee-p1363" }, actualSig);
  } catch {
    return false;
  }
}

function validateTemporalAndClaims(
  payload: Record<string, unknown>,
  options: JwtVerifyOptions,
): boolean {
  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) {
    return false;
  }

  if (options.issuer) {
    if (payload.iss !== options.issuer) {
      return false;
    }
  }
  if (options.audience) {
    const aud = payload.aud;
    const audOk =
      aud === options.audience ||
      (Array.isArray(aud) && aud.includes(options.audience));
    if (!audOk) {
      return false;
    }
  }
  return true;
}

type ParsedJwt = {
  header: JwtHeader;
  payload: Record<string, unknown>;
  signingInput: string;
  signatureB64: string;
};

function parseJwt(token: string): ParsedJwt | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }
  let header: JwtHeader;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as JwtHeader;
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  return {
    header,
    payload,
    signingInput: `${headerB64}.${payloadB64}`,
    signatureB64,
  };
}

function parseAndVerifyJwtPayload(
  token: string,
  options: JwtVerifyOptions,
): Record<string, unknown> | null {
  const parsed = parseJwt(token);
  if (!parsed) {
    return null;
  }
  const { header, payload, signingInput, signatureB64 } = parsed;
  if (header.alg !== "HS256" || !options.secret) {
    return null;
  }
  if (!verifyHs256(signingInput, signatureB64, options.secret)) {
    return null;
  }
  if (!validateTemporalAndClaims(payload, options)) {
    return null;
  }
  return payload;
}

async function parseAndVerifyJwtPayloadAsync(
  token: string,
  options: JwtVerifyOptions,
): Promise<Record<string, unknown> | null> {
  const parsed = parseJwt(token);
  if (!parsed) {
    return null;
  }
  const { header, payload, signingInput, signatureB64 } = parsed;
  const alg = header.alg;

  if (alg === "HS256") {
    if (!options.secret) {
      return null;
    }
    if (!verifyHs256(signingInput, signatureB64, options.secret)) {
      return null;
    }
  } else if (alg === "RS256" || alg === "ES256") {
    if (!options.jwksUrl) {
      return null;
    }
    const kid = header.kid;
    if (typeof kid !== "string" || kid.length === 0) {
      return null;
    }
    const key = await jwksCacheForUrl(options.jwksUrl).resolveKey(kid);
    if (!key || !verifyAsymmetricJwt(alg, key, signingInput, signatureB64)) {
      return null;
    }
  } else {
    return null;
  }

  if (!validateTemporalAndClaims(payload, options)) {
    return null;
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
  options: JwtVerifyOptions & { secret: string },
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

export async function verifyBearerJwtAsync(
  token: string,
  options: JwtVerifyOptions,
): Promise<VerifiedOficiosIdentity | null> {
  const payload = await parseAndVerifyJwtPayloadAsync(token, options);
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
  options: JwtVerifyOptions & { secret: string },
): VerifiedBootstrapJwt | null {
  const payload = parseAndVerifyJwtPayload(token, options);
  if (!payload) {
    return null;
  }
  return verifiedClaimsFromPayload(payload);
}

export async function verifyBearerJwtBootstrapAsync(
  token: string,
  options: JwtVerifyOptions,
): Promise<VerifiedBootstrapJwt | null> {
  const payload = await parseAndVerifyJwtPayloadAsync(token, options);
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