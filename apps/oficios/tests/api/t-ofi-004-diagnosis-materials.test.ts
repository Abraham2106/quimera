import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { startOficiosServer } from "../../src/server.js";
import {
  apiTestHeaders,
  seedCustomerEquipment,
  setupApiDb,
} from "./helpers.js";

describe("T-OFI-003/004 — clientes, diagnóstico SHA-256 y materiales", () => {
  let client: Sql;
  let dbAvailable = false;
  let customerId = "";
  let equipmentId = "";

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
    if (!dbAvailable) return;
    const seeded = await seedCustomerEquipment(client);
    customerId = seeded.customerId;
    equipmentId = seeded.equipmentId;
    await client`
      UPDATE ofi_customers
      SET legal_name = ${"Distribuidora Sintetica Demo"}, tax_id = ${"9001000001"}
      WHERE id = ${customerId}::uuid
    `;
  });

  afterAll(async () => {
    if (client) await client.end({ timeout: 2 });
  });

  it("lista clientes reales y persiste diagnóstico, material y servidor loopback", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const headers = apiTestHeaders();

    const listed = await app.request("/api/v1/customers", { headers });
    expect(listed.status).toBe(200);
    const customers = (await listed.json()) as {
      customers: Array<{ id: string; legalName: string }>;
    };
    expect(customers.customers.some((row) => row.legalName === "Distribuidora Sintetica Demo")).toBe(
      true,
    );

    const created = await app.request("/api/v1/work-orders", {
      method: "POST",
      headers,
      body: JSON.stringify({ customerId, equipmentId }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { workOrder: { id: string } };
    const workOrderId = createdBody.workOrder.id;

    const png = Buffer.from("foto-sintetica-demo");
    const sha256 = createHash("sha256").update(png).digest("hex");
    const diagnosis = await app.request(`/api/v1/work-orders/${workOrderId}/diagnosis`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        notes: "Presión baja en succión",
        measurements: { succionPsi: 68 },
        attachments: [
          {
            filename: "foto.jpg",
            sha256,
            contentBase64: png.toString("base64"),
          },
        ],
      }),
    });
    expect(diagnosis.status).toBe(201);

    const mismatch = await app.request(`/api/v1/work-orders/${workOrderId}/diagnosis`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        notes: "hash inválido",
        attachments: [{ filename: "x.jpg", sha256: "a".repeat(64), contentBase64: png.toString("base64") }],
      }),
    });
    expect(mismatch.status).toBe(400);

    const material = await app.request(`/api/v1/work-orders/${workOrderId}/materials`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cabysCode: "8415109010100",
        quantity: "2.5",
        unitPriceMinor: 150000,
        taxRate: "0.13",
      }),
    });
    expect(material.status).toBe(201);
    const materialBody = (await material.json()) as { material: { taxRateBps: number; unitPriceMinor: string } };
    expect(materialBody.material.taxRateBps).toBe(1300);
    expect(materialBody.material.unitPriceMinor).toBe("150000");

    const detail = await app.request(`/api/v1/work-orders/${workOrderId}`, { headers });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      workOrder: {
        customerLegalName: string;
        diagnoses: Array<{ attachments: Array<{ sha256: string }> }>;
        materials: Array<{ cabysCode: string }>;
      };
    };
    expect(detailBody.workOrder.customerLegalName).toBe("Distribuidora Sintetica Demo");
    expect(detailBody.workOrder.diagnoses[0]?.attachments[0]?.sha256).toBe(sha256);
    expect(detailBody.workOrder.materials[0]?.cabysCode).toBe("8415109010100");

    const missing = await app.request(`/api/v1/work-orders/${randomUUID()}`, { headers });
    expect(missing.status).toBe(404);

    const started = await startOficiosServer({ port: 0, host: "127.0.0.1" });
    try {
      expect(started.url.startsWith("http://127.0.0.1:")).toBe(true);
      const health = await fetch(`${started.url}/api/v1/health`, { headers });
      expect(health.status === 200 || health.status === 503).toBe(true);
    } finally {
      await started.close();
    }
  });
});