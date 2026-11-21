import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { withOfiTenantTransaction } from "../../src/db/connection.js";
import { TENANT_ID, apiTestHeaders, seedCustomerEquipment, setupApiDb } from "./helpers.js";

function csvFile(): File {
  const csv = [
    "nombre,cedula,serial,nota",
    "Ana,3101223344,SN-1,revisar",
    "Beto,3101223344,SN-2,otro",
  ].join("\n");
  return new File([csv], "clientes.csv", { type: "text/csv" });
}

function zipBomb(): File {
  const filename = Buffer.from("payload.bin", "utf8");
  const compressed = Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]);
  const localHeader = Buffer.alloc(30 + filename.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(60 * 1024 * 1024, 22);
  localHeader.writeUInt16LE(filename.length, 26);
  localHeader.writeUInt16LE(0, 28);
  filename.copy(localHeader, 30);
  const central = Buffer.alloc(46 + filename.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt32LE(compressed.length, 18);
  central.writeUInt32LE(60 * 1024 * 1024, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt32LE(30 + filename.length, 38);
  filename.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(localHeader.length + compressed.length, 16);
  const bytes = Buffer.concat([localHeader, compressed, central, eocd]);
  return new File([bytes], "bomba.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("portal Data Exodus, adjuntos y sincronización offline", () => {
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
  });

  afterAll(async () => {
    if (client) await client.end({ timeout: 2 });
  });

  it("rechaza XXE y zip-bomb sin persistir el archivo", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const headers = { ...apiTestHeaders("ADMIN") };
    delete headers["content-type"];

    const before = await withOfiTenantTransaction(client, TENANT_ID, async (tx) =>
      tx<{ count: string }[]>`SELECT count(*)::text AS count FROM qum_artifacts`,
    );

    const xxe = new File(
      ['<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe "pwned">]><root/>'],
      "malicioso.xml",
      { type: "application/xml" },
    );
    const xxeBody = new FormData();
    xxeBody.set("file", xxe);
    const xxeResponse = await app.request("/api/v1/migrations/uploads", {
      method: "POST",
      headers,
      body: xxeBody,
    });
    expect(xxeResponse.status).toBe(400);
    const xxeJson = (await xxeResponse.json()) as { error: { code: string } };
    expect(xxeJson.error.code).toBe("ERR_SEC_XXE_REJECTED");

    const bombBody = new FormData();
    bombBody.set("file", zipBomb());
    const bombResponse = await app.request("/api/v1/migrations/uploads", {
      method: "POST",
      headers,
      body: bombBody,
    });
    expect(bombResponse.status).toBe(400);

    const after = await withOfiTenantTransaction(client, TENANT_ID, async (tx) =>
      tx<{ count: string }[]>`SELECT count(*)::text AS count FROM qum_artifacts`,
    );
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it("completa Data Exodus desde la API: revisión, decisión inmutable y resume con procedencia", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const headers = { ...apiTestHeaders("ADMIN"), "x-actor-id": "admin-web" };
    delete headers["content-type"];
    const body = new FormData();
    body.set("file", csvFile());
    const uploaded = await app.request("/api/v1/migrations/uploads", { method: "POST", headers, body });
    expect(uploaded.status).toBe(201);
    const uploadJson = (await uploaded.json()) as { runId: string };
    const jsonHeaders = apiTestHeaders("ADMIN");
    jsonHeaders["x-actor-id"] = "admin-web";

    const profiled = await app.request(`/api/v1/migrations/${uploadJson.runId}/profile`, {
      method: "POST",
      headers: jsonHeaders,
    });
    expect(profiled.status).toBe(200);
    const profileJson = (await profiled.json()) as { needsReview: Array<{ column: string; status: string }> };
    expect(profileJson.needsReview.some((column) => column.status === "NEEDS_REVIEW")).toBe(true);

    const conflicts = await app.request(`/api/v1/migrations/${uploadJson.runId}/conflicts`, {
      headers: jsonHeaders,
    });
    const conflictJson = (await conflicts.json()) as { conflicts: Array<{ id: string; status: string }> };
    expect(conflictJson.conflicts[0]?.status).toBe("OPEN");
    const conflictId = conflictJson.conflicts[0]?.id;
    expect(conflictId).toBeTruthy();

    const blocked = await app.request(`/api/v1/migrations/${uploadJson.runId}/resume`, {
      method: "POST",
      headers: jsonHeaders,
    });
    expect(blocked.status).toBe(409);

    const decision = await app.request(`/api/v1/migrations/${uploadJson.runId}/decisions`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        conflictId,
        action: "KEEP_SEPARATE",
        rationale: "Son dos clientes distintos con la misma cédula mal cargada",
      }),
    });
    expect(decision.status).toBe(201);
    const decisionJson = (await decision.json()) as { decision: { actorId: string } };
    expect(decisionJson.decision.actorId).toBe("admin-web");

    const again = await app.request(`/api/v1/migrations/${uploadJson.runId}/decisions`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ conflictId, action: "MERGE", rationale: "No se puede reescribir" }),
    });
    expect(again.status).toBe(409);

    const resumed = await app.request(`/api/v1/migrations/${uploadJson.runId}/resume`, {
      method: "POST",
      headers: jsonHeaders,
    });
    expect(resumed.status).toBe(200);

    const provenance = await withOfiTenantTransaction(client, TENANT_ID, async (tx) =>
      tx<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM ofi_customers AS c
        INNER JOIN qum_provenance_entries AS e ON e.entity_id = c.provenance_entity_id
        WHERE c.legal_name IN ('Ana', 'Beto')
      `,
    );
    expect(Number(provenance[0]?.count)).toBe(2);

    const repeated = await app.request(`/api/v1/migrations/${uploadJson.runId}/resume`, {
      method: "POST",
      headers: jsonHeaders,
    });
    expect(repeated.status).toBe(200);
    const still = await withOfiTenantTransaction(client, TENANT_ID, async (tx) =>
      tx<{ count: string }[]>`
        SELECT count(*)::text AS count FROM ofi_customers WHERE legal_name IN ('Ana', 'Beto')
      `,
    );
    expect(still[0]?.count).toBe("2");
  });

  it("acepta PNG y PDF y rechaza ejecutables", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const headers = { ...apiTestHeaders("OPERATOR") };
    delete headers["content-type"];
    const created = await app.request("/api/v1/work-orders", {
      method: "POST",
      headers: apiTestHeaders(),
      body: JSON.stringify({ customerId, equipmentId }),
    });
    const workOrderId = ((await created.json()) as { workOrder: { id: string } }).workOrder.id;

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const pngBody = new FormData();
    pngBody.set("file", new File([png], "foto.png", { type: "image/png" }));
    const stored = await app.request(`/api/v1/work-orders/${workOrderId}/attachments`, {
      method: "POST",
      headers,
      body: pngBody,
    });
    expect(stored.status).toBe(201);
    const storedJson = (await stored.json()) as { attachmentId: string };
    const downloaded = await app.request(
      `/api/v1/work-orders/${workOrderId}/attachments/${storedJson.attachmentId}`,
      { headers: apiTestHeaders() },
    );
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-type")).toBe("image/png");

    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const pdfBody = new FormData();
    pdfBody.set("file", new File([pdf], "informe.pdf", { type: "application/pdf" }));
    const pdfResponse = await app.request(`/api/v1/work-orders/${workOrderId}/attachments`, {
      method: "POST",
      headers,
      body: pdfBody,
    });
    expect(pdfResponse.status).toBe(201);

    const exe = new Uint8Array([0x4d, 0x5a, 0x00, 0x00]);
    const exeBody = new FormData();
    exeBody.set("file", new File([exe], "malware.exe", { type: "application/octet-stream" }));
    const rejected = await app.request(`/api/v1/work-orders/${workOrderId}/attachments`, {
      method: "POST",
      headers,
      body: exeBody,
    });
    expect(rejected.status).toBe(400);

    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    oversized[2] = 0xff;
    const bigBody = new FormData();
    bigBody.set("file", new File([oversized], "grande.jpg", { type: "image/jpeg" }));
    const tooBig = await app.request(`/api/v1/work-orders/${workOrderId}/attachments`, {
      method: "POST",
      headers,
      body: bigBody,
    });
    expect(tooBig.status).toBe(413);
  });

  it("aplica cada client_mutation_id una vez y responde 409 sin pisar ni crear FiscalIntent", async () => {
    if (!dbAvailable) return;
    const app = createApp({ sql: client });
    const created = await app.request("/api/v1/work-orders", {
      method: "POST",
      headers: apiTestHeaders(),
      body: JSON.stringify({ customerId, equipmentId }),
    });
    const workOrderId = ((await created.json()) as { workOrder: { id: string; version: number } }).workOrder.id;
    const mutationId = randomUUID();
    const first = await app.request(`/api/v1/work-orders/${workOrderId}/sync`, {
      method: "POST",
      headers: apiTestHeaders(),
      body: JSON.stringify({
        clientMutationId: mutationId,
        expectedVersion: 1,
        kind: "diagnosis",
        notes: "Sin señal en el techo",
      }),
    });
    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as { diagnosisId: string; version: number };
    const replay = await app.request(`/api/v1/work-orders/${workOrderId}/sync`, {
      method: "POST",
      headers: apiTestHeaders(),
      body: JSON.stringify({
        clientMutationId: mutationId,
        expectedVersion: 1,
        kind: "diagnosis",
        notes: "Otro texto que no debe duplicarse",
      }),
    });
    expect(replay.status).toBe(200);
    const replayJson = (await replay.json()) as { diagnosisId: string };
    expect(replayJson.diagnosisId).toBe(firstJson.diagnosisId);

    const conflict = await app.request(`/api/v1/work-orders/${workOrderId}/sync`, {
      method: "POST",
      headers: apiTestHeaders(),
      body: JSON.stringify({
        clientMutationId: randomUUID(),
        expectedVersion: 1,
        kind: "diagnosis",
        notes: "Versión vieja",
      }),
    });
    expect(conflict.status).toBe(409);

    const counts = await withOfiTenantTransaction(client, TENANT_ID, async (tx) =>
      tx<{ diagnoses: string; intents: string; version: string }[]>`
        SELECT
          (SELECT count(*) FROM ofi_diagnoses WHERE work_order_id = ${workOrderId}::uuid AND notes = 'Sin señal en el techo')::text AS diagnoses,
          (SELECT count(*) FROM fob_fiscal_intents)::text AS intents,
          (SELECT version FROM ofi_work_orders WHERE id = ${workOrderId}::uuid)::text AS version
      `,
    );
    expect(counts[0]?.diagnoses).toBe("1");
    expect(counts[0]?.version).toBe(String(firstJson.version));
    expect(Number(counts[0]?.intents ?? "0")).toBe(0);
  });
});
