import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { enqueueIntent } from "../../src/store/intent.js";
import { countIntents, resetFobSchema, seedTenant, TENANT_A } from "./helpers.js";

const INPUT = {
  tenantId: TENANT_A,
  issuerId: "3101111111",
  environment: "mock" as const,
  operationId: "sale-9001",
  purpose: "primary",
  docType: "01",
  payloadSnapshot: { totalMinor: 150000, currency: "CRC" },
};

describe.sequential("T-OUT-002 — enqueueIntent idempotente", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("20 inserciones concurrentes producen 1 fila", async () => {
    if (!client) throw new Error("no client");

    const results = await Promise.all(
      Array.from({ length: 20 }, () => enqueueIntent(client, INPUT)),
    );

    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);
    expect(await countIntents(client, TENANT_A)).toBe(1);

    for (const row of results) {
      expect(row.operationId).toBe(INPUT.operationId);
      expect(row.status).toBe("QUEUED");
    }
  });
});