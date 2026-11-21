import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withFobTenantTransaction } from "../../src/db/connection.js";
import { processOnce } from "../../src/worker/process-once.js";
import { countIntents, resetFobSchema, seedTenant, TENANT_A } from "../store/helpers.js";
import { buildWorkerDoc, persistWorkerDoc } from "./document-fixture.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("suscripción suspended no detiene un FiscalIntent encolado", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    await client.unsafe(await readFile(path.join(repoRoot, "apps/oficios/drizzle/0006_saas_billing.sql"), "utf8"));
    await withFobTenantTransaction(client, TENANT_A, async (tx) => {
      await tx`
        INSERT INTO saas_subscriptions (tenant_id, plan_code, status, current_period_end)
        VALUES (${TENANT_A}::uuid, 'starter', 'suspended', now() + interval '30 days')
      `;
    });
    const doc = buildWorkerDoc(88);
    await persistWorkerDoc(client, doc);
    await withFobTenantTransaction(client, TENANT_A, async (tx) => {
      await tx`
        UPDATE fob_fiscal_documents
        SET delivery_state = 'ENVIADO'
        WHERE clave = ${doc.clave}
      `;
    });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("completa el polling y no duplica el intent", async () => {
    if (!client) throw new Error("no client");
    const before = await countIntents(client, TENANT_A);
    const result = await processOnce(client, {
      workerId: "suspended-tenant",
      tenantId: TENANT_A,
      transport: {
        async postDocument() {
          throw new Error("no debe crear otro envío");
        },
        async getByClave() {
          return { httpStatus: 200, response: { estado: "aceptado" }, error: null };
        },
      },
    });
    expect(result.processed).toBe(true);
    if (result.processed) expect(result.action).toBe("get");
    expect(await countIntents(client, TENANT_A)).toBe(before);
  });
});