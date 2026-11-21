import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/api/app.js";
import { ERR_FORBIDDEN, ERR_UNAUTHORIZED } from "../../src/api/errors.js";
import {
  bearerAuthHeaders,
  createEphemeralJwtSecret,
  signTestOficiosJwt,
} from "./test-jwt.js";
import { seedCustomerEquipment, setupApiDb, TENANT_ID } from "./helpers.js";

describe("T-SEC — autenticación JWT en OficiOS", () => {
  let client: Sql;
  let dbAvailable: boolean;
  let jwtSecret: string;
  let previousAuthMode: string | undefined;
  let previousJwtSecret: string | undefined;

  beforeAll(async () => {
    previousAuthMode = process.env.OFICIOS_AUTH_MODE;
    previousJwtSecret = process.env.OFICIOS_JWT_SECRET;
    vi.stubEnv("OFICIOS_AUTH_MODE", "jwt");
    jwtSecret = createEphemeralJwtSecret();
    vi.stubEnv("OFICIOS_JWT_SECRET", jwtSecret);

    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
  });

  afterAll(async () => {
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
    await client?.end({ timeout: 5 });
  });

  function tokenFor(
    role: "ADMIN" | "OPERATOR" | "AUDITOR_READONLY",
    tenantId = TENANT_ID,
    opts?: { expiresAtSec?: number },
  ): string {
    return signTestOficiosJwt({
      secret: jwtSecret,
      tenantId,
      role,
      actorId: "jwt-test-actor",
      ...opts,
    });
  }

  it("rechaza petición sin token (401)", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const res = await app.request("/api/v1/customers", { method: "GET" });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe(ERR_UNAUTHORIZED);
  });

  it("rechaza JWT con firma alterada (401)", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const token = tokenFor("OPERATOR");
    const tampered = `${token.slice(0, -4)}XXXX`;
    const res = await app.request("/api/v1/customers", {
      headers: bearerAuthHeaders(tampered, { "content-type": "application/json" }),
    });
    expect(res.status).toBe(401);
  });

  it("rechaza JWT expirado (401)", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const token = tokenFor("OPERATOR", TENANT_ID, {
      expiresAtSec: Math.floor(Date.now() / 1000) - 60,
    });
    const res = await app.request("/api/v1/customers", {
      headers: bearerAuthHeaders(token),
    });
    expect(res.status).toBe(401);
  });

  it("rechaza suplantación por x-tenant-id sin Bearer válido (401)", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const res = await app.request("/api/v1/customers", {
      headers: {
        "x-tenant-id": TENANT_ID,
        "x-test-role": "ADMIN",
        "x-actor-id": "spoof",
      },
    });
    expect(res.status).toBe(401);
  });

  it("AUDITOR_READONLY recibe 403 en mutación sin encolar cierre fiscal", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const { customerId, equipmentId } = await seedCustomerEquipment(client);
    const app = createApp({ sql: client });
    const token = tokenFor("AUDITOR_READONLY");
    const headers = bearerAuthHeaders(token);

    const res = await app.request("/api/v1/work-orders", {
      method: "POST",
      headers,
      body: JSON.stringify({ customerId, equipmentId }),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe(ERR_FORBIDDEN);

    const otherTenant = randomUUID();
    const spoofToken = tokenFor("OPERATOR", otherTenant);
    const list = await app.request("/api/v1/customers", {
      headers: bearerAuthHeaders(spoofToken),
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { customers: unknown[] };
    expect(body.customers).toEqual([]);
  });
});