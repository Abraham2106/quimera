import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../../src/db/connection.js";
import { enqueueIntent } from "../../src/store/intent.js";
import { resetFobSchema, seedTenant, TENANT_A } from "../store/helpers.js";

export const TENANT_B = "22222222-2222-7222-8222-222222222222";

describe.sequential("T-SEC-FOB-RLS — aislamiento fob_*", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client, TENANT_A);
    await seedTenant(client, TENANT_B);
    await enqueueIntent(client, {
      tenantId: TENANT_A,
      issuerId: "3101000001",
      environment: "mock",
      operationId: "rls-a",
      docType: "01",
      payloadSnapshot: {},
    });
    await enqueueIntent(client, {
      tenantId: TENANT_B,
      issuerId: "3101000002",
      environment: "mock",
      operationId: "rls-b",
      docType: "01",
      payloadSnapshot: {},
    });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("con contexto A no lee intenciones del tenant B", async (ctx) => {
    if (!client) throw new Error("no client");
    const rows = await withFobTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ operation_id: string }[]>`
        SELECT operation_id FROM fob_fiscal_intents ORDER BY operation_id
      `,
    );
    expect(rows.map((r) => r.operation_id)).toEqual(["rls-a"]);
    expect(ctx).toBeDefined();
  });

  it("FK compuesta impide que el tenant A referencie una intención del tenant B", async () => {
    if (!client) throw new Error("no client");
    const rows = await withFobTenantTransaction(client, TENANT_B, async (tx) =>
      tx<{ id: string }[]>`
        SELECT id::text AS id FROM fob_fiscal_intents WHERE operation_id = 'rls-b'
      `,
    );
    const intentId = rows[0]?.id;
    expect(intentId).toBeDefined();

    await expect(
      withFobTenantTransaction(client, TENANT_A, async (tx) => {
        await tx`
          INSERT INTO fob_fiscal_documents (
            id, tenant_id, intent_id, clave, consecutivo, delivery_state
          ) VALUES (
            gen_random_uuid(),
            ${TENANT_A}::uuid,
            ${intentId}::uuid,
            ${"1".repeat(50)},
            ${"1".repeat(20)},
            'FIRMADO'
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("sin app.current_tenant_id no devuelve filas", async () => {
    if (!client) throw new Error("no client");
    const rows = await client<{ count: string }[]>`
      SELECT count(*)::text AS count FROM fob_fiscal_intents
    `;
    expect(Number(rows[0]?.count ?? "0")).toBe(0);
  });
});