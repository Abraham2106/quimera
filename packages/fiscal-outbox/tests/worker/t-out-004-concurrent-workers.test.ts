import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { processOnce } from "../../src/worker/process-once.js";
import { resetFobSchema, seedTenant } from "../store/helpers.js";
import { buildWorkerDoc, persistWorkerDoc, TENANT_A } from "./document-fixture.js";
import { createCountingTransport } from "./transport-mock.js";

describe.sequential("T-OUT-004 — SKIP LOCKED evita doble POST", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    await persistWorkerDoc(client, buildWorkerDoc(42));
  });

  afterAll(async () => {
    await client?.end();
  });

  it("dos processOnce concurrentes emiten un solo POST", async () => {
    if (!client) throw new Error("no client");

    const transport = createCountingTransport({
      post: () => ({ httpStatus: 201, response: null, error: null }),
      get: () => ({
        httpStatus: 200,
        response: { estado: "aceptado" },
        error: null,
      }),
    });

    const [a, b] = await Promise.all([
      processOnce(client, { workerId: "w-a", tenantId: TENANT_A, transport }),
      processOnce(client, { workerId: "w-b", tenantId: TENANT_A, transport }),
    ]);

    expect(transport.postCount).toBe(1);
    expect(a.processed || b.processed).toBe(true);
    const acted = [a, b].filter((r) => r.processed);
    expect(acted).toHaveLength(1);
    expect(acted[0]?.action).toBe("post");
  });
});