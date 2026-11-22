import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    channel: "chrome",
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
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "mobile", use: { ...devices["Pixel 5"], channel: "chrome" } },
  ],
});
