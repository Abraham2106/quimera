import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PgDocumentStore, withFobTenantTransaction } from "@quimera/fiscal-outbox";

import { createApp } from "../../src/api/app.js";
import { apiTestHeaders, setupApiDb, TENANT_ID } from "./helpers.js";
import {
  buildWorkerDoc,
  ISSUER,
} from "../../../../packages/fiscal-outbox/tests/worker/document-fixture.js";

const P12_BYTES = Buffer.from([0x30, 0x82, 0x01, 0x04, 0x05]);
const CERT_NOT_AFTER = "2027-06-01T00:00:00.000Z";
const PIN = "9876";
const IDP_USER = "hacienda-user";
const IDP_PASS = "hacienda-pass";

describe.sequential("fiscal credentials — ADMIN / operador", () => {
  let dbAvailable = false;
  let client: Awaited<ReturnType<typeof setupApiDb>>["client"];

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
    if (!dbAvailable) return;

    const doc = buildWorkerDoc(41);
    const store = new PgDocumentStore(client, {
      tenantId: TENANT_ID,
      issuerId: ISSUER,
      environment: "staging",
      docType: "01",
    });
    await store.persist(doc);
    await withFobTenantTransaction(client, TENANT_ID, async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_ID}, true)`;
      await tx`
        UPDATE fob_fiscal_documents
        SET delivery_state = 'ACEPTADO'
        WHERE clave = ${doc.clave}
      `;
    });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("OPERATOR no puede leer ni cargar credenciales", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const read = await app.request("/api/v1/fiscal/credentials", { headers: apiTestHeaders("OPERATOR") });
    expect(read.status).toBe(403);
    const write = await app.request("/api/v1/fiscal/credentials", {
      method: "POST",
      headers: apiTestHeaders("OPERATOR"),
      body: JSON.stringify({
        issuerId: ISSUER,
        environment: "sandbox",
        p12Base64: P12_BYTES.toString("base64"),
        pin: PIN,
        idpUsername: IDP_USER,
        idpPassword: IDP_PASS,
        certNotAfter: CERT_NOT_AFTER,
      }),
    });
    expect(write.status).toBe(403);
  });

  it("ADMIN upload no filtra secretos en JSON", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const res = await app.request("/api/v1/fiscal/credentials", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify({
        issuerId: ISSUER,
        environment: "sandbox",
        p12Base64: P12_BYTES.toString("base64"),
        pin: PIN,
        idpUsername: IDP_USER,
        idpPassword: IDP_PASS,
        certNotAfter: CERT_NOT_AFTER,
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(PIN);
    expect(text).not.toContain(IDP_PASS);
    expect(text).not.toContain(P12_BYTES.toString("base64"));
    expect(text).not.toContain("ciphertext");
    expect(text).not.toContain("dekWrapped");
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.issuerId).toBe(ISSUER);
  });

  it("promote a producción exige QG-07", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });

    const blocked = await app.request("/api/v1/fiscal/credentials/promote", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify({ issuerId: ISSUER }),
    });
    expect(blocked.status).toBe(409);

    await app.request("/api/v1/fiscal/credentials", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify({
        issuerId: ISSUER,
        environment: "production",
        p12Base64: P12_BYTES.toString("base64"),
        pin: PIN,
        idpUsername: IDP_USER,
        idpPassword: IDP_PASS,
        certNotAfter: CERT_NOT_AFTER,
      }),
    });

    const ok = await app.request("/api/v1/fiscal/credentials/promote", {
      method: "POST",
      headers: apiTestHeaders("ADMIN"),
      body: JSON.stringify({ issuerId: ISSUER }),
    });
    expect(ok.status).toBe(200);
    const payload = (await ok.json()) as { activeEnvironment?: string };
    expect(payload.activeEnvironment).toBe("production");
  });
});