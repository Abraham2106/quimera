import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startOficiosServer, type StartedOficiosServer } from "../../src/server.js";

let server: StartedOficiosServer | undefined;
let priorStaticDir: string | undefined;

afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
  if (priorStaticDir === undefined) {
    delete process.env.OFICIOS_STATIC_DIR;
  } else {
    process.env.OFICIOS_STATIC_DIR = priorStaticDir;
  }
});

describe("oficios static bundle", () => {
  it("sirve index.html y manifest.webmanifest sin interceptar /healthz", async () => {
    priorStaticDir = process.env.OFICIOS_STATIC_DIR;
    const dir = await mkdtemp(path.join(os.tmpdir(), "ofi-static-"));
    await writeFile(
      path.join(dir, "index.html"),
      "<!doctype html><title>oficios</title>",
      "utf8",
    );
    await writeFile(
      path.join(dir, "manifest.webmanifest"),
      JSON.stringify({ name: "OficiOS" }),
      "utf8",
    );
    await writeFile(
      path.join(dir, "sw.js"),
      "self.addEventListener('install', () => {});",
      "utf8",
    );
    process.env.OFICIOS_STATIC_DIR = dir;

    server = await startOficiosServer({ port: 0, host: "127.0.0.1" });
    const base = server.url;

    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("oficios");

    const manifest = await fetch(`${base}/manifest.webmanifest`);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toContain("manifest");
    const manifestJson = (await manifest.json()) as { name: string };
    expect(manifestJson.name).toBe("OficiOS");

    const sw = await fetch(`${base}/sw.js`);
    expect(sw.status).toBe(200);
    expect(await sw.text()).toContain("install");

    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    const healthJson = (await health.json()) as { ok: boolean; live: boolean };
    expect(healthJson.ok).toBe(true);
    expect(healthJson.live).toBe(true);
  });
});