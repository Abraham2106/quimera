import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { applyDecision, DataExodusError } from "../../src/decisions/index.js";
import { withTenantTransaction } from "../../src/db/connection.js";
import { migrateVerified } from "../../src/migrate/index.js";
import { trace } from "../../src/profile/index.js";
import { resetAndMigrate, seedTenants, TENANT_A } from "../db/helpers.js";
import { buildDemoHvacMiniDataset, demoReconcileCounts } from "./fixtures.js";
import {
  attachDecisionToEntityProvenance,
  countEntitiesByStatus,
  countOfiCustomers,
  listOpenBlockingConflicts,
  persistReconcileSnapshot,
} from "./helpers.js";

function defaultAction(conflictCode: string) {
  if (conflictCode === "UNRECONCILABLE_BALANCE") {
    return "MARK_UNRECONCILABLE" as const;
  }
  if (conflictCode === "PROBABLE_DUPLICATE") {
    return "KEEP_SEPARATE" as const;
  }
  return "OVERRIDE_FIELD" as const;
}

describe.sequential("demo-hvac — reconcile, decisiones y migrate (T-DATA-013)", () => {
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

  it("reconcileDetect cuenta 40/12/7/3/1 anomalías en memoria", () => {
    const result = demoReconcileCounts();
    expect(result.countsByCode.PROBABLE_DUPLICATE).toBe(40);
    expect(result.countsByCode.EXACT_DUPLICATE).toBe(12);
    expect(result.countsByCode.CONFLICTING_IDENTITY).toBe(3);
    expect(result.countsByCode.UNRECONCILABLE_BALANCE).toBe(1);
    const paymentIssues =
      (result.countsByCode.ORPHAN_RECORD ?? 0) +
      (result.countsByCode.INVALID_REFERENCE ?? 0);
    expect(paymentIssues).toBe(7);
  });

  it("persiste snapshot y bloquea migrate con BLOCKING abiertos", async () => {
    if (!client) throw new Error("no client");
    const dataset = buildDemoHvacMiniDataset();
    const reconcile = demoReconcileCounts();
    const snapshot = await persistReconcileSnapshot(
      client,
      TENANT_A,
      dataset,
      reconcile.conflicts,
    );
    anchorEntityId = snapshot.anchorEntityId;

    await expect(migrateVerified(client, { tenantId: TENANT_A, ensureMinimalOfiTables: true }))
      .rejects.toMatchObject({
        code: "ERR_MIGRATION_BLOCKED_BY_CONFLICTS",
      } satisfies Partial<DataExodusError>);
  });

  it("tras resolver bloqueantes, dry-run no deja filas y migrate carga destino", async () => {
    if (!client) throw new Error("no client");

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
            : "Resolución demo batch para migrate",
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

    const migratedAfterDry = await countEntitiesByStatus(client, TENANT_A, "MIGRATED");
    const ofiAfterDry = await countOfiCustomers(client);
    expect(migratedAfterDry).toBe(migratedBefore);
    expect(ofiAfterDry).toBe(ofiBefore);

    const report = await migrateVerified(client, {
      tenantId: TENANT_A,
      ensureMinimalOfiTables: true,
    });
    expect(report.entitiesMigratedInQum).toBeGreaterThan(0);
    expect(report.checksums.migratedEntityCount).toBe(report.entitiesMigratedInQum);

    const migratedAfter = await countEntitiesByStatus(client, TENANT_A, "MIGRATED");
    expect(migratedAfter).toBeGreaterThan(migratedBefore);

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
    const node = lineage.chain[0]!;
    expect(node.artifact?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(node.decision?.decisionId).toBe(decisionRow!.id);
    expect(node.sourceLocator).toBe("anchor");
  });
});