import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { ERR_WORK_ORDER_APPROVAL_REQUIRED } from "../../src/domain/work-order-errors.js";
import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "../../src/domain/hvac-refrigeration-v1.js";
import {
  TENANT_ID,
  apiTestHeaders,
  seedCustomerEquipment,
  setupApiDb,
} from "./helpers.js";

describe("AT-15 — API bloquea transición sin aprobación", () => {
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
        'QUOTED',
        false,
        2
      )
    `;
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  it("PATCH transition → CLOSED responde 409 y no muta el estado", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }

    const app = createApp({ sql: client });
    const res = await app.request(
      `/api/v1/work-orders/${workOrderId}/transition`,
      {
        method: "PATCH",
        headers: apiTestHeaders(),
        body: JSON.stringify({
          targetStatus: "CLOSED",
          expectedVersion: 2,
        }),
      },
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as {
      ok: false;
      error: { code: string };
    };
    expect(json.error.code).toBe(ERR_WORK_ORDER_APPROVAL_REQUIRED);

    const rows = await client<{ status: string }[]>`
      SELECT status FROM ofi_work_orders WHERE id = ${workOrderId}::uuid
    `;
    expect(rows[0]?.status).toBe("QUOTED");

    const intents = await client<{ count: string }[]>`
      SELECT count(*)::text AS count FROM fob_fiscal_intents
      WHERE tenant_id = ${TENANT_ID}::uuid AND operation_id = ${workOrderId}
    `;
    expect(Number(intents[0]?.count ?? "0")).toBe(0);
  });
});