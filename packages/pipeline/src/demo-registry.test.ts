import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createExodusOficiosRegistry,
  decisionsLookApplied,
} from "./demo-registry.js";
import type { StepContext } from "@quimera/core";

const ctx = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  correlationId: "demo",
  clock: { now: () => new Date("2026-01-01T00:00:00.000Z") },
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  artifacts: {
    async put() {
      return { sha256: "a".repeat(64), byteSize: 0, storageUri: "mem://a" };
    },
    async get() {
      return null;
    },
  },
} as unknown as StepContext;

describe("exodus-to-oficios registry", () => {
  it("pausa si decisions-demo.yaml no está APPLIED y sigue cuando sí", async () => {
    expect(decisionsLookApplied("status: DRAFT\n")).toBe(false);
    expect(decisionsLookApplied("status: APPLIED\n")).toBe(true);

    const dir = await mkdtemp(path.join(tmpdir(), "quimera-decisions-"));
    const draft = path.join(dir, "decisions.yaml");
    await writeFile(draft, "status: DRAFT\n", "utf8");
    const registry = createExodusOficiosRegistry();
    const paused = await registry["pipeline.human_review"]!.execute(ctx, {
      stepId: "human_conflict_gate",
      config: { decisionsFile: draft },
      upstreamOutputs: { reconcile: { blocking: 63 } },
      isHumanGate: true,
    });
    expect(paused.kind).toBe("waiting_approval");

    const applied = path.join(dir, "applied.yaml");
    await writeFile(applied, "status: APPLIED\n", "utf8");
    const done = await registry["pipeline.human_review"]!.execute(ctx, {
      stepId: "human_conflict_gate",
      config: { decisionsFile: applied },
      upstreamOutputs: { reconcile: { blocking: 63 } },
      isHumanGate: true,
    });
    expect(done.kind).toBe("success");
  });
});