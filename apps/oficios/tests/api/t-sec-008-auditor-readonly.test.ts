import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { ERR_FORBIDDEN } from "../../src/api/errors.js";
import { apiTestHeaders, seedCustomerEquipment, setupApiDb } from "./helpers.js";

describe("T-SEC-008 — AUDITOR_READONLY no muta", () => {
  let client: Sql;
  let dbAvailable: boolean;

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  it("POST work-orders devuelve 403", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }

    const { customerId, equipmentId } = await seedCustomerEquipment(client);
    const app = createApp({ sql: client });
    const res = await app.request("/api/v1/work-orders", {
      method: "POST",
      headers: apiTestHeaders("AUDITOR_READONLY"),
      body: JSON.stringify({ customerId, equipmentId }),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe(ERR_FORBIDDEN);
  });
});