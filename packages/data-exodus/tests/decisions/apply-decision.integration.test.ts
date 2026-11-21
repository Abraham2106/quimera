import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { applyDecision, DataExodusError } from "../../src/decisions/index.js";
import { withTenantTransaction } from "../../src/db/connection.js";
import { qumConflicts } from "../../src/db/schema/index.js";
import { resetAndMigrate, seedTenants, TENANT_A } from "../db/helpers.js";
import { buildDemoHvacMiniDataset, demoReconcileCounts } from "../migrate/fixtures.js";
import { persistReconcileSnapshot } from "../migrate/helpers.js";

describe.sequential("applyDecision — inmutabilidad (T-DATA-007)", () => {
  let client: Sql | undefined;
  let sampleConflictId: string;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    const dataset = buildDemoHvacMiniDataset();
    const reconcile = demoReconcileCounts();
    const snapshot = await persistReconcileSnapshot(
      client,
      TENANT_A,
      dataset,
      reconcile.conflicts,
    );
    const blocking = snapshot.conflicts.find(
      (c) => c.severity === "BLOCKING" && c.status === "OPEN",
    );
    if (!blocking) {
      throw new Error("expected an open blocking conflict");
    }
    sampleConflictId = blocking.id;
  });

  afterAll(async () => {
    await client?.end();
  });

  it("persiste decisión con actor, acción y rationale", async () => {
    if (!client) throw new Error("no client");
    const conflict = await withTenantTransaction(client, TENANT_A, async (db) => {
      const rows = await db
        .select()
        .from(qumConflicts)
        .where(eq(qumConflicts.id, sampleConflictId));
      return rows[0];
    });

    const wrapped = {
      id: conflict!.id,
      tenantId: conflict!.tenantId,
      conflictCode: conflict!.conflictCode,
      severity: conflict!.severity,
      status: conflict!.status,
      candidateEntityIds: conflict!.candidateEntityIds as string[],
    };

    const result = await withTenantTransaction(client, TENANT_A, async (db) =>
      applyDecision(db, wrapped, "KEEP_SEPARATE", "operator@demo.cr", "Marcas distintas en registro"),
    );

    expect(result.decision.actorId).toBe("operator@demo.cr");
    expect(result.decision.action).toBe("KEEP_SEPARATE");
    expect(result.decision.rationale.length).toBeGreaterThanOrEqual(3);
    expect(result.conflictStatus).toBe("RESOLVED");
  });

  it("rechaza segunda decisión sin supersedes (ERR_CONFLICT_ALREADY_RESOLVED)", async () => {
    if (!client) throw new Error("no client");
    const conflict = await withTenantTransaction(client, TENANT_A, async (db) => {
      const rows = await db.select().from(qumConflicts).limit(1);
      const open = rows.find((r) => r.status === "OPEN" && r.severity === "BLOCKING");
      return open ?? rows[0];
    });

    const wrapped = {
      id: conflict.id,
      tenantId: conflict.tenantId,
      conflictCode: conflict.conflictCode,
      severity: conflict.severity,
      status: conflict.status,
      candidateEntityIds: conflict.candidateEntityIds as string[],
    };

    await withTenantTransaction(client, TENANT_A, async (db) => {
      if (conflict.status === "OPEN") {
        await applyDecision(db, wrapped, "KEEP_SEPARATE", "op@demo.cr", "primera resolución");
      }
    });

    await expect(
      withTenantTransaction(client, TENANT_A, async (db) =>
        applyDecision(
          db,
          { ...wrapped, status: "RESOLVED" },
          "MERGE",
          "op@demo.cr",
          "intento sobrescribir",
        ),
      ),
    ).rejects.toMatchObject({ code: "ERR_CONFLICT_ALREADY_RESOLVED" } satisfies Partial<DataExodusError>);
  });

  it("permite enmienda vía supersedes_decision_id", async () => {
    if (!client) throw new Error("no client");
    const conflictId = randomUUID();

    await withTenantTransaction(client, TENANT_A, async (db) => {
      await db.insert(qumConflicts).values({
        id: conflictId,
        tenantId: TENANT_A,
        conflictCode: "PROBABLE_DUPLICATE",
        severity: "BLOCKING",
        status: "OPEN",
        candidateEntityIds: [],
        evidenceRefs: [],
        summary: "demo enmienda",
      });

      const first = await applyDecision(
        db,
        {
          id: conflictId,
          tenantId: TENANT_A,
          conflictCode: "PROBABLE_DUPLICATE",
          severity: "BLOCKING",
          status: "OPEN",
          candidateEntityIds: [],
        },
        "KEEP_SEPARATE",
        "op@demo.cr",
        "decisión inicial",
      );

      const amended = await applyDecision(
        db,
        {
          id: conflictId,
          tenantId: TENANT_A,
          conflictCode: "PROBABLE_DUPLICATE",
          severity: "BLOCKING",
          status: "RESOLVED",
          candidateEntityIds: [],
        },
        "MERGE",
        "supervisor@demo.cr",
        "enmienda tras revisión",
        { supersedesDecisionId: first.decision.id },
      );

      expect(amended.decision.supersedesDecisionId).toBe(first.decision.id);
    });
  });
});