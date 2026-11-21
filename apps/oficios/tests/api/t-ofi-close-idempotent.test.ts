import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "../../src/domain/hvac-refrigeration-v1.js";
import {
  TENANT_ID,
  apiTestHeaders,
  seedCustomerEquipment,
  setupApiDb,
} from "./helpers.js";

describe("T-OFI — close encola como máximo 1 fiscal intent", () => {
  let client: Sql;
  let dbAvailable: boolean;
  let workOrderId: string;

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
    if (!dbAvailable) {
      return;
    }

    const { customerId, equipmentId } = await seedCustomerEquipment(client);
    workOrderId = randomUUID();
    await client`
      INSERT INTO ofi_work_orders (
        id,
        tenant_id,
        customer_id,
        equipment_id,
        trade_contract_id,
        status,
        customer_authorized,
        version
      )
      VALUES (
        ${workOrderId}::uuid,
        ${TENANT_ID}::uuid,
        ${customerId}::uuid,
        ${equipmentId}::uuid,
        ${HVAC_REFRIGERATION_V1_CONTRACT_ID},
        'VERIFIED',
        true,
        6
      )
    `;
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  it("dos POST close dejan una sola fila en fob_fiscal_intents", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }

    const app = createApp({ sql: client });
    const headers = apiTestHeaders();

    const first = await app.request(`/api/v1/work-orders/${workOrderId}/close`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedVersion: 6 }),
    });
    expect(first.status).toBe(200);

    const second = await app.request(`/api/v1/work-orders/${workOrderId}/close`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedVersion: 7 }),
    });
    expect(second.status).toBe(200);

    const json1 = (await first.json()) as { fiscalIntentId: string };
    const json2 = (await second.json()) as { fiscalIntentId: string };
    expect(json1.fiscalIntentId).toBe(json2.fiscalIntentId);

    const intents = await client<{ id: string }[]>`
      SELECT id FROM fob_fiscal_intents
      WHERE tenant_id = ${TENANT_ID}::uuid
        AND operation_id = ${workOrderId}
    `;
    expect(intents).toHaveLength(1);
  });
});