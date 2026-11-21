import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../../src/db/connection.js";
import { processOnce } from "../../src/worker/process-once.js";
import { resetFobSchema, seedTenant } from "../store/helpers.js";
import { buildWorkerDoc, ISSUER, TENANT_A } from "./document-fixture.js";
import { PgDocumentStore } from "../../src/store/pg-document-store.js";
import { createCountingTransport } from "./transport-mock.js";

describe.sequential("T-OUT-006 — POST bloqueado sin XML firmado persistido", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    const doc = buildWorkerDoc(88);
    const store = new PgDocumentStore(client, {
      tenantId: TENANT_A,
      issuerId: ISSUER,
      environment: "mock",
      docType: "01",
    });
    await store.persist(doc);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("no invoca transporte POST si falta signed_xml_artifact_id", async () => {
    if (!client) throw new Error("no client");

    const transport = createCountingTransport({
      post: () => ({ httpStatus: 201, response: null, error: null }),
      get: () => ({
        httpStatus: 200,
        response: { estado: "aceptado" },
        error: null,
      }),
    });

    await expect(
      processOnce(client, { workerId: "w-gate", tenantId: TENANT_A, transport }),
    ).rejects.toThrow(/ERR_SIGNED_XML_MISSING/);
    expect(transport.postCount).toBe(0);
    expect(transport.getCount).toBe(0);

    const row = await withFobTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ signed_xml_artifact_id: string | null }[]>`
        SELECT signed_xml_artifact_id
        FROM fob_fiscal_documents
        LIMIT 1
      `,
    );
    expect(row[0]?.signed_xml_artifact_id).toBeNull();
  });
});