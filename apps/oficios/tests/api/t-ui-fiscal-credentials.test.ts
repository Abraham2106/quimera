import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { resetFiscalCredentialStore } from "../../src/api/routes/fiscal-credentials.js";
import { apiTestHeaders, setupApiDb } from "./helpers.js";

describe("credenciales fiscales de la UI", () => {
  let client: Sql;
  let dbAvailable = false;

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
    resetFiscalCredentialStore();
  });

  afterAll(async () => {
    await client?.end({ timeout: 2 });
  });

  it("acepta un PKCS#12 de prueba sin devolver el PIN", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const headers = { ...apiTestHeaders("ADMIN") };
    delete headers["content-type"];
    const body = new FormData();
    body.set("file", new File([Uint8Array.from([0x30, 0x03, 0x02, 0x01])], "emisor.p12"));
    body.set("pin", "1234");
    const response = await app.request("/api/v1/fiscal/credentials", {
      method: "POST",
      headers,
      body,
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { fingerprint?: string; pin?: string };
    expect(json.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(json)).not.toContain("1234");
  });

  it("la promoción responde QG-07 sin aceptación de sandbox", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const response = await app.request("/api/v1/fiscal/credentials/promote", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify({ adminConfirmed: true }),
    });
    expect(response.status).toBe(409);
    const json = (await response.json()) as { error: { message: string } };
    expect(json.error.message).toContain("QG-07");
  });
});
