import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    headless: true,
    trace: "off",
    video: "off",
    screenshot: "off",
    extraHTTPHeaders: {
      "x-tenant-id": "22222222-2222-7222-8222-222222222222",
      "x-test-role": "ADMIN",
      "x-actor-id": "e2e-browser-admin",
    },
  },
  reporter: [["list"]],
});