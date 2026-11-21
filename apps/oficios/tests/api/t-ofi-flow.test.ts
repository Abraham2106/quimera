import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { ERR_WORK_ORDER_APPROVAL_REQUIRED } from "../../src/domain/work-order-errors.js";
import { apiTestHeaders, seedCustomerEquipment, setupApiDb } from "./helpers.js";

describe("flujo OficiOS recepción → cierre con FiscalIntent", () => {
  let client: Sql;
  let dbAvailable = false;

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
  });

  afterAll(async () => {
    if (client) await client.end({ timeout: 2 });
  });

  it("bloquea el cierre sin aprobación y encola una intención fiscal al cerrar", async () => {
    if (!dbAvailable) return;
    const { customerId, equipmentId } = await seedCustomerEquipment(client);
    await client`
      UPDATE ofi_customers
      SET legal_name = ${"Distribuidora Sintetica Flujo"}
      WHERE id = ${customerId}::uuid
    `;
    const app = createApp({ sql: client });
    const headers = apiTestHeaders();

    const customers = await app.request("/api/v1/customers", { headers });
    expect(customers.status).toBe(200);
    const equipment = await app.request(`/api/v1/customers/${customerId}/equipment`, { headers });
    expect(equipment.status).toBe(200);

    const created = await app.request("/api/v1/work-orders", {
      method: "POST",
      headers,
      body: JSON.stringify({ customerId, equipmentId }),
    });
    expect(created.status).toBe(201);
    const workOrderId = ((await created.json()) as { workOrder: { id: string; version: number } }).workOrder.id;

    async function transition(targetStatus: string, version: number) {
      return app.request(`/api/v1/work-orders/${workOrderId}/transition`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ targetStatus, expectedVersion: version }),
      });
    }

    const diagnosed = await transition("DIAGNOSED", 1);
    expect(diagnosed.status).toBe(200);
    const quoted = await transition("QUOTED", 2);
    expect(quoted.status).toBe(200);
    const blocked = await transition("CLOSED", 3);
    expect(blocked.status).toBe(409);
    const blockedBody = (await blocked.json()) as { error: { code: string } };
    expect(blockedBody.error.code).toBe(ERR_WORK_ORDER_APPROVAL_REQUIRED);

    const approved = await app.request(`/api/v1/work-orders/${workOrderId}/approvals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ approverName: "Cliente en taller" }),
    });
    expect(approved.status).toBe(201);
    const started = await transition("IN_PROGRESS", 4);
    expect(started.status).toBe(200);
    const verified = await transition("VERIFIED", 5);
    expect(verified.status).toBe(200);
    const closed = await app.request(`/api/v1/work-orders/${workOrderId}/close`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedVersion: 6 }),
    });
    expect(closed.status).toBe(200);
    const closedBody = (await closed.json()) as { fiscalIntentId: string; status: string };
    expect(closedBody.status).toBe("CLOSED");
    expect(closedBody.fiscalIntentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const detail = await app.request(`/api/v1/work-orders/${workOrderId}`, { headers });
    const detailBody = (await detail.json()) as {
      workOrder: { status: string; fiscalIntentId: string; customerLegalName: string };
    };
    expect(detailBody.workOrder.status).toBe("CLOSED");
    expect(detailBody.workOrder.fiscalIntentId).toBe(closedBody.fiscalIntentId);
    expect(detailBody.workOrder.customerLegalName).toBe("Distribuidora Sintetica Flujo");
  });
});