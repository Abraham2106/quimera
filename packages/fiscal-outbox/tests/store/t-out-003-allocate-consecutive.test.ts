import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { allocateConsecutive } from "../../src/store/sequences.js";
import { resetFobSchema, seedTenant, TENANT_A } from "./helpers.js";

const SCOPE = {
  tenantId: TENANT_A,
  issuerId: "3101999999",
  environment: "mock" as const,
  branch: "001",
  terminal: "00001",
  docType: "01",
};

function runChildAllocations(count: number): Promise<number[]> {
  const workerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "allocate-worker.ts",
  );
  return new Promise((resolve, reject) => {
    const child = fork(workerPath, [String(count)], {
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgres://quimera:quimera@127.0.0.1:5432/quimera",
        FOB_TENANT_ID: TENANT_A,
      },
      stdio: "inherit",
    });
    let payload = "";
    child.on("message", (msg) => {
      payload = String(msg);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`allocate-worker exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(payload) as number[]);
      } catch (cause) {
        reject(cause);
      }
    });
  });
}

describe.sequential("T-OUT-003 — allocateConsecutive atómico", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("50 reservas concurrentes (2 procesos) sin colisiones ni huecos", async () => {
    if (!client) throw new Error("no client");

    const [localBatch, childBatch] = await Promise.all([
      Promise.all(Array.from({ length: 25 }, () => allocateConsecutive(client!, SCOPE))),
      runChildAllocations(25),
    ]);

    const all = [...localBatch, ...childBatch].sort((a, b) => a - b);
    expect(all).toHaveLength(50);
    expect(new Set(all).size).toBe(50);

    for (let i = 0; i < 50; i++) {
      expect(all[i]).toBe(i + 1);
    }
  });
});