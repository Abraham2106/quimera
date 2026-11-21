import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { Sql } from "postgres";

import { withOfiTenantTransaction } from "../../src/db/connection.js";
import { startOficiosServer, type StartedOficiosServer } from "../../src/server.ts";
import {
  TENANT_ID,
  seedCustomerEquipment,
  setupApiDb,
} from "../api/helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const testHeaders = {
  "x-tenant-id": TENANT_ID,
  "x-test-role": "ADMIN",
  "x-actor-id": "e2e-browser-admin",
};

let server: StartedOficiosServer;
let dbClient: Sql;
let customerId = "";
let equipmentId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.OFICIOS_AUTH_MODE = "test-headers";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://quimera:quimera@127.0.0.1:5432/quimera";

  execFileSync("pnpm", ["run", "build:web"], {
    cwd: packageRoot,
    env: {
      ...process.env,
      VITE_TEST_ROLE: "ADMIN",
      VITE_TENANT_ID: TENANT_ID,
      VITE_ACTOR_ID: "e2e-browser-admin",
    },
    stdio: "inherit",
  });

  const setup = await setupApiDb();
  if (!setup.dbAvailable) {
    throw new Error("PostgreSQL no disponible para e2e");
  }
  dbClient = setup.client;
  const seeded = await seedCustomerEquipment(dbClient);
  customerId = seeded.customerId;
  equipmentId = seeded.equipmentId;

  await withOfiTenantTransaction(dbClient, TENANT_ID, async (tx) => {
    await tx`
      INSERT INTO saas_subscriptions (tenant_id, plan_code, status, current_period_end)
      VALUES (${TENANT_ID}::uuid, 'starter', 'trialing', now() + interval '30 days')
      ON CONFLICT (tenant_id) DO NOTHING
    `;
    await tx`
      INSERT INTO saas_memberships (id, tenant_id, user_sub, role, status)
      VALUES (gen_random_uuid(), ${TENANT_ID}::uuid, 'e2e-admin', 'ADMIN', 'active')
      ON CONFLICT DO NOTHING
    `;
    await tx`
      INSERT INTO saas_audit_logs (id, tenant_id, actor_id, action, resource)
      VALUES (gen_random_uuid(), ${TENANT_ID}::uuid, 'e2e-setup', 'e2e.staging', 'playwright')
    `;
  });

  server = await startOficiosServer({ port: 0, host: "127.0.0.1" });
});

test.afterAll(async () => {
  await server?.close();
  await dbClient?.end({ timeout: 2 });
});

test("pantalla servida: onboarding, Data Exodus, orden, cobro y auditoría", async ({
  page,
}) => {
  const api = await playwrightRequest.newContext({
    baseURL: server.url,
    extraHTTPHeaders: testHeaders,
  });
  await page.goto(server.url);
  await expect(page.getByRole("heading", { name: "Alta de organización B2B" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data Exodus" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plan y consumo" })).toBeVisible();

  const xxeDir = await mkdtemp(path.join(os.tmpdir(), "ofi-xxe-"));
  const xxePath = path.join(xxeDir, "malicioso.xml");
  await writeFile(
    xxePath,
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe "pwned">]><root/>',
    "utf8",
  );
  const xxeInput = page.locator('section:has-text("Data Exodus") input[type="file"]');
  await xxeInput.setInputFiles(xxePath);
  await page.locator('section:has-text("Data Exodus") button:has-text("Subir")').click();
  await expect(page.getByText(/xxe|rechaz|no se pudo/i)).toBeVisible({ timeout: 15_000 });

  const csvDir = await mkdtemp(path.join(os.tmpdir(), "ofi-csv-"));
  const csvPath = path.join(csvDir, "clientes.csv");
  await writeFile(
    csvPath,
    ["nombre,cedula,serial,nota", "Ana,3101223344,SN-1,revisar", "Beto,3101223344,SN-2,otro"].join(
      "\n",
    ),
    "utf8",
  );
  await xxeInput.setInputFiles(csvPath);
  await page.locator('section:has-text("Data Exodus") button:has-text("Subir")').click();
  await expect(page.getByText(/Corrida/)).toBeVisible({ timeout: 15_000 });
  await page.locator('section:has-text("Data Exodus") button:has-text("Perfilar")').click();
  await expect(page.getByText("NEEDS_REVIEW")).toBeVisible({ timeout: 20_000 });

  const rationale = page
    .locator('section:has-text("Data Exodus") input[name="rationale"]')
    .first();
  await expect(rationale).toBeVisible({ timeout: 15_000 });
  await rationale.fill("Dos clientes distintos con la misma cédula");
  await page
    .locator('section:has-text("Data Exodus") button:has-text("Registrar decisión")')
    .first()
    .click();
  await expect(page.getByText(/Decisión registrada/i)).toBeVisible({ timeout: 15_000 });

  await page.locator('section:has-text("Data Exodus") button:has-text("Reanudar carga")').click();
  await expect(page.getByText(/Carga (completed|COMPLETED|completada)/i)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Ver consumo" }).click();
  await expect(page.getByText(/starter/i)).toBeVisible({ timeout: 10_000 });

  const audit = await api.get("/api/v1/audit", {
    headers: { ...testHeaders, "x-test-role": "AUDITOR_READONLY" },
  });
  expect(audit.ok()).toBeTruthy();
  const auditJson = (await audit.json()) as { events: unknown[] };
  expect(auditJson.events.length).toBeGreaterThan(0);

  await page.reload();
  const workOrderForm = page.locator("form").filter({ hasText: "Recibir orden" });
  const customerSelect = workOrderForm.locator("select").first();
  await customerSelect.selectOption({ value: customerId });
  const equipmentSelect = workOrderForm.locator("select").nth(1);
  await expect(equipmentSelect.locator("option")).not.toHaveCount(0);
  await equipmentSelect.selectOption({ value: equipmentId });
  const equipmentValue = await equipmentSelect.inputValue();
  expect(equipmentValue).toBe(equipmentId);
  await page.getByRole("button", { name: "Recibir orden" }).click();
  await expect(page.getByText("Orden de servicio")).toBeVisible({ timeout: 15_000 });

  const workOrderMatch = await page
    .locator("section")
    .filter({ hasText: "Orden de servicio" })
    .textContent();
  const idFromFolio = workOrderMatch?.includes("OS-2026");

  await page.getByRole("button", { name: "Guardar diagnóstico" }).click();
  await expect(page.getByText(/Diagnóstico|DIAGNOSED|guardado/i).first()).toBeVisible({
    timeout: 15_000,
  });

  expect(idFromFolio).toBeTruthy();

  const pngDir = await mkdtemp(path.join(os.tmpdir(), "ofi-png-"));
  const pngPath = path.join(pngDir, "foto.png");
  await writeFile(
    pngPath,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  );
  const workOrderSection = page.locator("section").filter({ hasText: "Orden de servicio" });
  const photoInput = workOrderSection.locator('input[type="file"][name="file"]');
  await photoInput.setInputFiles(pngPath);
  await workOrderSection.getByRole("button", { name: "Subir adjunto" }).click();
  await expect(page.getByText("Adjunto subido correctamente.")).toBeVisible({
    timeout: 15_000,
  });

  await page.context().setOffline(true);
  const offlineNote = `offline-e2e-${Date.now()}`;
  await page.locator('input[value*="Presión"]').fill(offlineNote);
  await page.getByRole("button", { name: "Guardar diagnóstico" }).click();
  await expect(page.getByText(/cola|reconectar/i)).toBeVisible({ timeout: 10_000 });

  await page.context().setOffline(false);
  await page.waitForTimeout(2500);

  const rows = await withOfiTenantTransaction(dbClient, TENANT_ID, async (tx) =>
    tx<{ count: string; offline_count: string }[]>`
      SELECT
        count(*)::text AS count,
        count(*) FILTER (WHERE d.notes = ${offlineNote})::text AS offline_count
      FROM ofi_diagnoses d
      INNER JOIN ofi_work_orders w ON w.id = d.work_order_id
      WHERE w.customer_id = ${customerId}::uuid
    `,
  );
  expect(Number(rows[0]?.count ?? "0")).toBeGreaterThanOrEqual(1);
  expect(Number(rows[0]?.offline_count ?? "0")).toBeGreaterThanOrEqual(1);

  await api.dispose();
});