import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../../src/db/connection.js";
import {
  claimNextDocument,
  isPostDispatched,
  releaseDocumentLease,
} from "../../src/worker/claim.js";
import {
  markPostDispatchedAtomically,
  patchFiscalDocumentAttempts,
  transitionFiscalDocument,
} from "../../src/worker/persist-delivery.js";
import { processOnce } from "../../src/worker/process-once.js";
import { resetFobSchema, seedTenant } from "../store/helpers.js";
import { buildWorkerDoc, persistWorkerDoc } from "./document-fixture.js";
import { createCountingTransport } from "./transport-mock.js";

describe.sequential("T-SEC-FOB-FENCE — lease y doble claim", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    await persistWorkerDoc(client, buildWorkerDoc(910));
  });

  afterAll(async () => {
    await client?.end();
  });

  it("un lease robado invalida toda escritura del worker anterior", async () => {
    if (!client) throw new Error("no client");
    const claim = await claimNextDocument(client, {
      workerId: "w-stale",
      tenantId: "11111111-1111-7111-8111-111111111111",
    });
    expect(claim).not.toBeNull();
    const documentId = claim!.id;
    await withFobTenantTransaction(client, claim!.tenant_id, async (tx) => {
      await tx`
        UPDATE fob_fiscal_documents SET lease_owner = 'w-current' WHERE id = ${documentId}::uuid
      `;
    });

    await expect(
      patchFiscalDocumentAttempts(client, claim!, 9, null, undefined, "w-stale"),
    ).rejects.toThrow(/ERR_FOB_FENCE/);
    await expect(
      transitionFiscalDocument(client, claim!, "PENDIENTE", "stale", undefined, "w-stale"),
    ).rejects.toThrow(/ERR_FOB_FENCE/);
    await expect(
      markPostDispatchedAtomically(client, claim!.tenant_id, documentId, "w-stale"),
    ).rejects.toThrow(/ERR_FOB_FENCE/);

    await releaseDocumentLease(client, claim!.tenant_id, documentId, "w-stale");
    const rows = await withFobTenantTransaction(client, claim!.tenant_id, async (tx) =>
      tx<{ lease_owner: string | null }[]>`
        SELECT lease_owner FROM fob_fiscal_documents WHERE id = ${documentId}::uuid
      `,
    );
    expect(rows[0]?.lease_owner).toBe("w-current");
    await releaseDocumentLease(client, claim!.tenant_id, documentId, "w-current");
  });

  it("un segundo worker no reclama el mismo documento con lease vigente", async () => {
    if (!client) throw new Error("no client");
    const tenantId = "11111111-1111-7111-8111-111111111111";
    await persistWorkerDoc(client, buildWorkerDoc(911));
    const first = await claimNextDocument(client, {
      workerId: "w-a",
      tenantId,
      leaseSeconds: 120,
      now: () => new Date("2026-11-21T00:00:00.000Z"),
    });
    expect(first).not.toBeNull();
    const second = await claimNextDocument(client, {
      workerId: "w-b",
      tenantId,
      leaseSeconds: 120,
      now: () => new Date("2026-11-21T00:00:01.000Z"),
    });
    expect(second).toBeNull();
    await releaseDocumentLease(client, tenantId, first!.id, "w-a");
  });

  it("marca _postDispatched de forma atómica antes del POST", async () => {
    if (!client) throw new Error("no client");
    const tenantId = "11111111-1111-7111-8111-111111111111";
    const doc = buildWorkerDoc(912);
    await persistWorkerDoc(client, doc);
    let flagDuringPost: boolean | undefined;

    const transport = createCountingTransport({
      post: async (input) => {
        const rows = await withFobTenantTransaction(client, tenantId, async (tx) =>
          tx<{ last_error_json: Record<string, unknown> | null }[]>`
            SELECT last_error_json FROM fob_fiscal_documents WHERE clave = ${input.clave}
          `,
        );
        flagDuringPost = isPostDispatched(rows[0]?.last_error_json ?? null);
        return { httpStatus: 201, response: null, error: null };
      },
      get: () => ({ httpStatus: 200, response: { estado: "aceptado" }, error: null }),
    });

    const result = await processOnce(client, {
      workerId: "w-post",
      tenantId,
      transport,
    });
    expect(result.processed).toBe(true);
    expect(transport.postCount).toBe(1);
    expect(flagDuringPost).toBe(true);
  });
});
