import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../../src/db/connection.js";
import { processOnce } from "../../src/worker/process-once.js";
import { resetFobSchema, seedTenant, TENANT_A } from "../store/helpers.js";
import { buildWorkerDoc } from "./document-fixture.js";
import { PgDocumentStore } from "../../src/store/pg-document-store.js";
import { createCountingTransport } from "./transport-mock.js";

describe.sequential("T-OUT-007 — el worker firma y persiste antes del POST", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    const doc = buildWorkerDoc(91);
    const store = new PgDocumentStore(client, {
      tenantId: TENANT_A,
      issuerId: "3101222222",
      environment: "mock",
      docType: "01",
    });
    await store.persist(doc);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("guarda fe_xml_signed antes de llamar al transporte y archiva la respuesta", async () => {
    if (!client) throw new Error("no client");
    const calls: string[] = [];
    const transport = createCountingTransport({
      post: () => {
        calls.push("post");
        return { httpStatus: 202, response: null, error: null, responseXml: undefined };
      },
      get: () => ({
        httpStatus: 200,
        response: { estado: "aceptado" },
        responseXml: "<MensajeHacienda><Clave>1</Clave></MensajeHacienda>",
        error: null,
      }),
    });

    const first = await processOnce(client, {
      workerId: "w-sign",
      tenantId: TENANT_A,
      transport,
      signXml: async (xml) => {
        calls.push("sign");
        return `${xml}<Signature/>`;
      },
    });
    expect(first.processed).toBe(true);
    expect(calls[0]).toBe("sign");
    expect(transport.postCount).toBe(1);

    const signed = await withFobTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ kind: string }[]>`
        SELECT a.artifact_kind AS kind
        FROM fob_fiscal_documents AS d
        INNER JOIN qum_artifacts AS a ON a.id = d.signed_xml_artifact_id
      `,
    );
    expect(signed[0]?.kind).toBe("fe_xml_signed");

    const second = await processOnce(client, {
      workerId: "w-sign",
      tenantId: TENANT_A,
      transport,
    });
    expect(second.processed).toBe(true);
    if (second.processed) {
      expect(second.action).toBe("get");
    }
    expect(transport.postCount).toBe(1);

    const response = await withFobTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ kind: string }[]>`
        SELECT a.artifact_kind AS kind
        FROM fob_fiscal_documents AS d
        INNER JOIN qum_artifacts AS a ON a.id = d.response_artifact_id
      `,
    );
    expect(response[0]?.kind).toBe("hacienda_response");
  });
});
