import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { apiTestHeaders, setupApiDb } from "./helpers.js";

const ISSUER_ID = "3-101-555443";

function certBody() {
  return {
    issuerId: ISSUER_ID,
    environment: "sandbox",
    p12Base64: Buffer.from([0x30, 0x03, 0x02, 0x01]).toString("base64"),
    pin: "1234",
    idpUsername: "facturacion@taller.cr",
    idpPassword: "secreto-idp",
    certNotAfter: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe("credenciales fiscales de la UI", () => {
  let client: Sql;
  let dbAvailable = false;

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
  });

  afterAll(async () => {
    await client?.end({ timeout: 2 });
  });

  it("acepta un PKCS#12 de prueba sin devolver secretos", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const response = await app.request("/api/v1/fiscal/credentials", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify(certBody()),
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ ok: true, issuerId: ISSUER_ID, environment: "sandbox" });
    const text = JSON.stringify(json);
    expect(text).not.toContain("1234");
    expect(text).not.toContain("secreto-idp");
  });

  it("la promoción bloquea sin certificado de producción vigente", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const response = await app.request("/api/v1/fiscal/credentials/promote", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify({ issuerId: ISSUER_ID }),
    });
    expect(response.status).toBe(409);
    const json = (await response.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("ERR_PROMOTION_BLOCKED");
  });
});
