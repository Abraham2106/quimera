import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";
import type { Sql } from "postgres";

import { startOficiosServer, type StartedOficiosServer } from "../../src/server.ts";
import { TENANT_ID, seedCustomerEquipment, setupApiDb } from "../api/helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let server: StartedOficiosServer;
let db: Sql;

async function walkShell(page: Page) {
  await page.goto(server.url);
  const nav = page.locator("nav").filter({ visible: true }).first();
  await expect(nav.getByRole("button", { name: "Órdenes" })).toBeVisible();
  await nav.getByRole("button", { name: "Data Exodus" }).click();
  await expect(page.getByText("1. Subir")).toBeVisible();
  await nav.getByRole("button", { name: "Administración" }).click();
  await page.getByRole("button", { name: "Plan y consumo" }).click();
  await expect(page.getByRole("heading", { name: "Plan y consumo" })).toBeVisible();
  await page.getByRole("button", { name: "Configuración fiscal" }).click();
  await expect(page.getByText("no constituye aceptación del Ministerio de Hacienda")).toBeVisible();
  await nav.getByRole("button", { name: "Órdenes" }).click();
  await expect(page.getByRole("heading", { name: "Órdenes", level: 2 })).toBeVisible();
}

test.beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.OFICIOS_AUTH_MODE = "test-headers";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://quimera:quimera@127.0.0.1:5432/quimera";
  execFileSync("pnpm", ["exec", "vite", "build", "--config", "vite.config.ts"], {
    cwd: packageRoot,
    env: {
      ...process.env,
      VITE_TEST_ROLE: "ADMIN",
      VITE_TENANT_ID: TENANT_ID,
      VITE_ACTOR_ID: "e2e-ui-admin",
    },
    stdio: "inherit",
  });
  const setup = await setupApiDb();
  if (!setup.dbAvailable) throw new Error("PostgreSQL no disponible");
  db = setup.client;
  await seedCustomerEquipment(db);
  process.env.OFICIOS_STATIC_DIR = path.join(packageRoot, "web", "dist");
  server = await startOficiosServer({ port: 0, host: "127.0.0.1" });
});

test.afterAll(async () => {
  await server?.close();
  await db?.end({ timeout: 2 });
});

test("recorrido del shell, orden, material y evidencia", async ({ page }) => {
  await walkShell(page);
  await page.getByRole("button", { name: "+ Nueva orden" }).click();
  await page.getByLabel("Cliente").selectOption({ label: "Cliente API" });
  await page.getByLabel("Equipo").selectOption({ index: 0 });
  await page.getByRole("button", { name: "Recibir orden" }).click();
  await expect(page.locator("article").getByText("Recibida").first()).toBeVisible();
  await page.getByRole("button", { name: "Guardar diagnóstico" }).click();
  await expect(page.locator("article").getByText("Diagnosticada").first()).toBeVisible();
  await page.getByRole("button", { name: "Generar presupuesto" }).click();
  await expect(page.getByText("Registrar aprobación del cliente")).toBeVisible();
  await page.getByRole("button", { name: "Materiales y CAByS" }).click();
  await page.getByLabel("Precio (₡)").fill("1.500,00");
  await page.getByRole("button", { name: "Agregar material con IVA 13%" }).click();
  await expect(page.getByText("₡1.500,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Diagnóstico y evidencia" }).click();
  const dir = await mkdtemp(path.join(os.tmpdir(), "ofi-png-"));
  const png = path.join(dir, "foto.png");
  await writeFile(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
  await page.locator('input[type="file"][capture="environment"]').setInputFiles(png);
  await expect(page.getByText(/5 MiB|adjunto|error/i)).toHaveCount(0);
});

test("la cola offline aparece al guardar sin red", async ({ page, context }) => {
  await page.goto(server.url);
  await page.getByRole("button", { name: "+ Nueva orden" }).click();
  await page.getByLabel("Cliente").selectOption({ label: "Cliente API" });
  await page.getByLabel("Equipo").selectOption({ index: 0 });
  await page.getByRole("button", { name: "Recibir orden" }).click();
  await expect(page.locator("article").getByText("Recibida").first()).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Guardar diagnóstico" }).click();
  await expect(page.getByRole("button", { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole("button", { name: /Sin conexión/ }).click();
  await expect(page.getByRole("dialog", { name: "Cola sin conexión" })).toBeVisible();
  await expect(page.getByText("En cola")).toBeVisible();
  await context.setOffline(false);
});
