import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { evaluatePromoteToProduction } from "../../src/config/promote-to-production.js";
import { PgDocumentStore } from "../../src/store/pg-document-store.js";
import { resetFobSchema, seedTenant, TENANT_A } from "../store/helpers.js";
import { buildWorkerDoc, ISSUER } from "../worker/document-fixture.js";

describe.sequential("QG-07 — promoción a producción", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    const doc = buildWorkerDoc(12);
    const store = new PgDocumentStore(client, {
      tenantId: TENANT_A,
      issuerId: ISSUER,
      environment: "staging",
      docType: "01",
    });
    await store.persist(doc);
    await client.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
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

  it("rechaza sin certificado de producción válido", async () => {
    if (!client) throw new Error("no client");
    const blocked = await evaluatePromoteToProduction(client, {
      tenantId: TENANT_A,
      issuerId: ISSUER,
      productionCertificateValid: false,
      adminConfirmed: true,
    });
    expect(blocked.ok).toBe(false);
  });

  it("acepta con aceptación en staging, certificado y ADMIN", async () => {
    if (!client) throw new Error("no client");
    const ok = await evaluatePromoteToProduction(client, {
      tenantId: TENANT_A,
      issuerId: ISSUER,
      productionCertificateValid: true,
      adminConfirmed: true,
    });
    expect(ok.ok).toBe(true);
  });
});