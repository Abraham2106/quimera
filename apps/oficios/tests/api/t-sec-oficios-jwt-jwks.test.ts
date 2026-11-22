import { generateKeyPairSync } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { resetJwtJwksCacheForTests } from "../../src/api/auth/jwt.js";
import { createApp } from "../../src/api/app.js";
import { ERR_UNAUTHORIZED } from "../../src/api/errors.js";
import { TENANT_ID, setupApiDb } from "./helpers.js";
import {
  signJwtWithPrivateKey,
  startLoopbackJwks,
  type LoopbackJwks,
} from "./test-jwks.js";

function bearerHeaders(token: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };
}

function oficiosClaims(expiresAtSec?: number) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "jwks-actor",
    exp: expiresAtSec ?? now + 3600,
    iat: now,
    tenant_id: TENANT_ID,
    role: "OPERATOR",
    iss: "https://idp.test",
    aud: "oficios-api",
  };
}

describe("T-SEC — JWT JWKS RS256/ES256", () => {
  let client: Sql;
  let dbAvailable: boolean;
  let jwks: LoopbackJwks;
  let previousJwksUrl: string | undefined;
  let previousJwtSecret: string | undefined;
  let previousIssuer: string | undefined;
  let previousAudience: string | undefined;
  let previousAuthMode: string | undefined;

  beforeAll(async () => {
    previousAuthMode = process.env.OFICIOS_AUTH_MODE;
    previousJwtSecret = process.env.OFICIOS_JWT_SECRET;
    previousJwksUrl = process.env.OFICIOS_JWKS_URL;
    previousIssuer = process.env.OFICIOS_JWT_ISSUER;
    previousAudience = process.env.OFICIOS_JWT_AUDIENCE;

    vi.stubEnv("OFICIOS_AUTH_MODE", "jwt");
    delete process.env.OFICIOS_JWT_SECRET;
    vi.stubEnv("OFICIOS_JWT_ISSUER", "https://idp.test");
    vi.stubEnv("OFICIOS_JWT_AUDIENCE", "oficios-api");

    jwks = await startLoopbackJwks();
    vi.stubEnv("OFICIOS_JWKS_URL", jwks.url);
    resetJwtJwksCacheForTests();

    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
  });

  afterAll(async () => {
    await jwks?.close();
    resetJwtJwksCacheForTests();
    if (previousAuthMode === undefined) {
      vi.unstubAllEnvs();
    } else {
      vi.stubEnv("OFICIOS_AUTH_MODE", previousAuthMode);
    }
    if (previousJwtSecret === undefined) {
      delete process.env.OFICIOS_JWT_SECRET;
    } else {
      vi.stubEnv("OFICIOS_JWT_SECRET", previousJwtSecret);
    }
    if (previousJwksUrl === undefined) {
      delete process.env.OFICIOS_JWKS_URL;
    } else {
      vi.stubEnv("OFICIOS_JWKS_URL", previousJwksUrl);
    }
    if (previousIssuer === undefined) delete process.env.OFICIOS_JWT_ISSUER;
    else vi.stubEnv("OFICIOS_JWT_ISSUER", previousIssuer);
    if (previousAudience === undefined) delete process.env.OFICIOS_JWT_AUDIENCE;
    else vi.stubEnv("OFICIOS_JWT_AUDIENCE", previousAudience);
    await client?.end({ timeout: 5 });
  });

  function rs256Token(opts?: { kid?: string; claims?: Record<string, unknown> }): string {
    return signJwtWithPrivateKey(
      jwks.privateKey,
      { alg: "RS256", typ: "JWT", kid: opts?.kid ?? jwks.kid },
      opts?.claims ?? oficiosClaims(),
    );
  }

  it("acepta RS256 válido vía JWKS (200)", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const res = await app.request("/api/v1/customers", {
      headers: bearerHeaders(rs256Token()),
    });
    expect(res.status).toBe(200);
  });

  it("rechaza JWT expirado (401)", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const token = rs256Token({
      claims: oficiosClaims(Math.floor(Date.now() / 1000) - 120),
    });
    const res = await app.request("/api/v1/customers", { headers: bearerHeaders(token) });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe(ERR_UNAUTHORIZED);
  });

  it("rechaza firma alterada (401)", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const token = `${rs256Token().slice(0, -4)}XXXX`;
    const res = await app.request("/api/v1/customers", { headers: bearerHeaders(token) });
    expect(res.status).toBe(401);
  });

  it("refresca JWKS tras rotación de kid desconocido", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const staleKid = "rotated-away";
    const staleToken = rs256Token({ kid: staleKid });
    const app = createApp({ sql: client });
    const stale = await app.request("/api/v1/customers", { headers: bearerHeaders(staleToken) });
    expect(stale.status).toBe(401);

    const { privateKey: nextPrivate, publicKey: nextPublic } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    jwks.rotateKeys([{ kid: staleKid, publicKey: nextPublic, alg: "RS256" }]);
    resetJwtJwksCacheForTests();

    const freshToken = signJwtWithPrivateKey(
      nextPrivate,
      { alg: "RS256", typ: "JWT", kid: staleKid },
      oficiosClaims(),
    );
    const ok = await app.request("/api/v1/customers", { headers: bearerHeaders(freshToken) });
    expect(ok.status).toBe(200);
  });

  it("acepta ES256 válido vía JWKS (200)", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const kid = "es256-key";
    jwks.rotateKeys([{ kid, publicKey: ec.publicKey, alg: "ES256" }]);
    resetJwtJwksCacheForTests();

    const token = signJwtWithPrivateKey(
      ec.privateKey,
      { alg: "ES256", typ: "JWT", kid },
      oficiosClaims(),
    );
    const app = createApp({ sql: client });
    const res = await app.request("/api/v1/customers", { headers: bearerHeaders(token) });
    expect(res.status).toBe(200);
  });
});