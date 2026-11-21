import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { loadDemoHvac1000 } from "../../src/demo/load-demo-hvac-1000.js";
import { resolveDemoHvacFixtureRoot } from "../../src/demo/resolve-repo-root.js";
import { applyDecision, DataExodusError } from "../../src/decisions/index.js";
import { withTenantTransaction } from "../../src/db/connection.js";
import { migrateVerified } from "../../src/migrate/index.js";
import { trace } from "../../src/profile/index.js";
import { resetAndMigrate, seedTenants, TENANT_A } from "../db/helpers.js";
import {
  attachDecisionToEntityProvenance,
  countEntitiesByStatus,
  countOfiCustomers,
  listOpenBlockingConflicts,
  persistReconcileSnapshot,
} from "../migrate/helpers.js";

function defaultAction(conflictCode: string) {
  if (conflictCode === "UNRECONCILABLE_BALANCE") {
    return "MARK_UNRECONCILABLE" as const;
  }
  if (conflictCode === "PROBABLE_DUPLICATE") {
    return "KEEP_SEPARATE" as const;
  }
  return "OVERRIDE_FIELD" as const;
}

describe.sequential("demo-hvac-1000 — migrate desde archivos (T-DATA-013)", () => {
  let client: Sql | undefined;
  let anchorEntityId: string;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    if (client) {
      await client`DROP TABLE IF EXISTS ofi_equipment CASCADE`;
      await client`DROP TABLE IF EXISTS ofi_customers CASCADE`;
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("persiste, bloquea migrate, resuelve conflictos y migra", async () => {
    if (!client) throw new Error("no client");

    const root = resolveDemoHvacFixtureRoot(import.meta.url);
    const { dataset, reconcile } = await loadDemoHvac1000(root);

    const snapshot = await persistReconcileSnapshot(
      client,
      TENANT_A,
      dataset,
      reconcile.conflicts,
    );
    anchorEntityId = snapshot.anchorEntityId;

    await expect(
      migrateVerified(client, { tenantId: TENANT_A, ensureMinimalOfiTables: true }),
    ).rejects.toMatchObject({
      code: "ERR_MIGRATION_BLOCKED_BY_CONFLICTS",
    } satisfies Partial<DataExodusError>);

    const open = await listOpenBlockingConflicts(client, TENANT_A);
    expect(open.length).toBeGreaterThan(0);

    for (const conflict of open) {
      const action = defaultAction(conflict.conflictCode);
      await withTenantTransaction(client, TENANT_A, async (db) => {
        await applyDecision(
          db,
          {
            id: conflict.id,
            tenantId: conflict.tenantId,
            conflictCode: conflict.conflictCode,
            severity: conflict.severity,
            status: conflict.status,
            candidateEntityIds: conflict.candidateEntityIds as string[],
          },
          action,
          "operator@demo.cr",
          action === "MARK_UNRECONCILABLE"
            ? "Saldo irreconciliable documentado en libro de excepciones"
            : "Resolución demo batch desde fixture HVAC-1000",
        );
      });
    }

    const remaining = await listOpenBlockingConflicts(client, TENANT_A);
    expect(remaining).toHaveLength(0);

    const migratedBefore = await countEntitiesByStatus(client, TENANT_A, "MIGRATED");
    const ofiBefore = await countOfiCustomers(client);

    const dryReport = await migrateVerified(client, {
      tenantId: TENANT_A,
      dryRun: true,
      ensureMinimalOfiTables: true,
    });
    expect(dryReport.dryRun).toBe(true);

    expect(await countEntitiesByStatus(client, TENANT_A, "MIGRATED")).toBe(migratedBefore);
    expect(await countOfiCustomers(client)).toBe(ofiBefore);

    const report = await migrateVerified(client, {
      tenantId: TENANT_A,
      ensureMinimalOfiTables: true,
    });
    expect(report.entitiesMigratedInQum).toBeGreaterThan(0);

    const sampleConflict = open[0]!;
    const decisionRow = await withTenantTransaction(client, TENANT_A, async (db) => {
      const { createDecisionsRepository } = await import("../../src/db/index.js");
      const repo = createDecisionsRepository(db);
      const decisions = await repo.listByConflict(TENANT_A, sampleConflict.id);
      return decisions[0];
    });
    expect(decisionRow).toBeDefined();

    await attachDecisionToEntityProvenance(
      client,
      TENANT_A,
      anchorEntityId,
      decisionRow!.id,
    );

    const lineage = await trace(client, TENANT_A, anchorEntityId);
    expect(lineage.chain.length).toBeGreaterThan(0);
  });
});