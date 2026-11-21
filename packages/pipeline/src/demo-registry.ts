import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  loadDemoHvac1000,
  persistDemoHvacToOficiosFromEnv,
  resolveDemoHvacFixtureRoot,
  type LoadDemoHvac1000Result,
} from "@quimera/data-exodus";

import type { StepRegistry, StepRegistryEntry } from "./types.js";

const CONTRACT = {
  name: "quimera.exodus.hvac",
  version: "1.0.0",
} as const;

let cachedLoad: Promise<LoadDemoHvac1000Result> | null = null;

function loadFixture(): Promise<LoadDemoHvac1000Result> {
  cachedLoad ??= loadDemoHvac1000(resolveDemoHvacFixtureRoot(import.meta.url));
  return cachedLoad;
}

export function decisionsLookApplied(raw: string): boolean {
  return /^status:\s*APPLIED\s*$/m.test(raw);
}

export async function readDecisionsApplied(filePath: string): Promise<boolean> {
  try {
    const raw = await readFile(filePath, "utf8");
    return decisionsLookApplied(raw);
  } catch {
    return false;
  }
}

function entry(
  uses: string,
  execute: StepRegistryEntry["execute"],
): StepRegistryEntry {
  return {
    uses,
    implementationVersion: "1.0.0",
    inputContract: CONTRACT,
    outputContract: CONTRACT,
    idempotent: true,
    execute,
  };
}

export function createExodusOficiosRegistry(): StepRegistry {
  return {
    "exodus.ingest": entry("exodus.ingest", async () => {
      const loaded = await loadFixture();
      return {
        kind: "success",
        output: {
          rowCount: loaded.rowCount,
          counts: loaded.reconcile.countsByCode,
        },
      };
    }),
    "exodus.reconcile": entry("exodus.reconcile", async () => {
      const loaded = await loadFixture();
      const blocking = loaded.reconcile.conflicts.filter(
        (conflict) => conflict.severity === "BLOCKING" && !conflict.autoResolved,
      );
      return {
        kind: "success",
        output: {
          counts: loaded.reconcile.countsByCode,
          blocking: blocking.length,
        },
      };
    }),
    "pipeline.human_review": entry("pipeline.human_review", async (_ctx, request) => {
      const fileValue = request.config["decisionsFile"];
      const filePath =
        typeof fileValue === "string" && fileValue.length > 0
          ? path.resolve(fileValue)
          : "";
      const applied = filePath ? await readDecisionsApplied(filePath) : false;
      const reconcile = request.upstreamOutputs["reconcile"] as
        | { blocking?: number }
        | undefined;
      const blocking = reconcile?.blocking ?? 0;
      if (!applied) {
        return {
          kind: "waiting_approval",
          blockingCount: blocking,
          output: { status: "WAITING_FOR_APPROVAL", blocking },
        };
      }
      return {
        kind: "success",
        output: { status: "APPLIED", blocking: 0 },
      };
    }),
    "exodus.migrate": entry("exodus.migrate", async (ctx, request) => {
      const reconcile = request.upstreamOutputs["reconcile"] as
        | { counts?: Record<string, number> }
        | undefined;
      const persisted = await persistDemoHvacToOficiosFromEnv(ctx.tenantId);
      return {
        kind: "success",
        output: {
          migrated: true,
          targetSchema: "oficios-v1@1.0.0",
          counts: reconcile?.counts ?? {},
          customers: persisted.customers,
          equipment: persisted.equipment,
        },
      };
    }),
  };
}
