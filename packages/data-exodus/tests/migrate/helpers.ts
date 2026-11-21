import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Sql } from "postgres";

import { withTenantTransaction } from "../../src/db/connection.js";
import {
  qumArtifacts,
  qumConflicts,
  qumEntities,
  qumDataSources,
  qumProvenanceEntries,
  qumSchemaVersions,
} from "../../src/db/schema/index.js";
import type { DetectedConflict, ReconcileDataset } from "../../src/reconcile/types.js";
import {
  DEMO_ARTIFACT_ID,
  DEMO_SCHEMA_VERSION_ID,
  DEMO_SHA256,
} from "./fixtures.js";

function stableEntityId(tenantId: string, recordId: string): string {
  const hex = createHash("sha256").update(`${tenantId}:${recordId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type PersistedSnapshot = {
  recordToEntity: Map<string, string>;
  conflicts: Array<{ id: string; severity: string; status: string; conflictCode: string }>;
  anchorEntityId: string;
};

export async function persistReconcileSnapshot(
  client: Sql,
  tenantId: string,
  dataset: ReconcileDataset,
  detected: DetectedConflict[],
): Promise<PersistedSnapshot> {
  const recordToEntity = new Map<string, string>();
  const blockingRecordIds = new Set<string>();

  for (const c of detected) {
    if (c.severity === "BLOCKING") {
      for (const id of c.candidateRecordIds) {
        blockingRecordIds.add(id);
      }
    }
  }

  const register = (recordId: string, entityType: string, naturalKey: string, data: object) => {
    const id = stableEntityId(tenantId, recordId);
    recordToEntity.set(recordId, id);
    return {
      id,
      tenantId,
      schemaVersionId: DEMO_SCHEMA_VERSION_ID,
      entityType,
      naturalKey,
      status: blockingRecordIds.has(recordId) ? "BLOCKED" : "VERIFIED",
      canonicalData: data,
    };
  };

  return withTenantTransaction(client, tenantId, async (db) => {
    await db.insert(qumSchemaVersions).values({
      id: DEMO_SCHEMA_VERSION_ID,
      schemaName: "hvac-mini",
      semver: "1.0.0",
      sha256: DEMO_SHA256,
      jsonSchema: {},
    });

    await db.insert(qumArtifacts).values({
      id: DEMO_ARTIFACT_ID,
      tenantId,
      sha256: DEMO_SHA256,
      artifactKind: "source_file",
      originalName: "clientes.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      byteSize: 1024,
      storageUri: `cas://sha256/aa/${DEMO_SHA256}`,
    });

    const sourceId = randomUUID();
    await db.insert(qumDataSources).values({
      id: sourceId,
      tenantId,
      name: "demo-hvac",
      sourceKind: "csv",
    });

    const entityRows = [
      ...dataset.clients.map((c) =>
        register(c.id, "customer", c.taxId ?? c.id, {
          legalName: c.legalName,
          taxId: c.taxId,
          recordId: c.id,
        }),
      ),
      ...dataset.invoices.map((i) =>
        register(i.id, "invoice", i.invoiceNumber, {
          invoiceNumber: i.invoiceNumber,
          recordId: i.id,
        }),
      ),
      ...dataset.payments.map((p) =>
        register(p.id, "payment", p.id, {
          invoiceNumber: p.invoiceNumber,
          recordId: p.id,
        }),
      ),
      ...(dataset.balances ?? []).map((b) =>
        register(b.id, "balance", b.clientId, {
          clientId: b.clientId,
          recordId: b.id,
        }),
      ),
    ];

    await db.insert(qumEntities).values(entityRows);

    const conflictRows = detected.map((c) => ({
      id: randomUUID(),
      tenantId,
      batchId: null,
      conflictCode: c.conflictCode,
      severity: c.severity,
      status: c.autoResolved ? "RESOLVED" : "OPEN",
      candidateEntityIds: c.candidateRecordIds.map((rid) => recordToEntity.get(rid) ?? rid),
      evidenceRefs: [{ fingerprint: c.fingerprint, summary: c.summary }],
      summary: c.summary,
    }));

    await db.insert(qumConflicts).values(conflictRows);

    const anchorEntityId = recordToEntity.get("client-anchor")!;

    await db.insert(qumProvenanceEntries).values({
      id: randomUUID(),
      tenantId,
      entityId: anchorEntityId,
      fieldPath: "legalName",
      artifactId: DEMO_ARTIFACT_ID,
      schemaVersionId: DEMO_SCHEMA_VERSION_ID,
      originKind: "DIRECT_PARSE",
      transformationId: "csv-import@1.0.0",
      ruleVersion: "1.0.0",
      metadataJson: { sourceLocator: "anchor" },
    });

    return {
      recordToEntity,
      conflicts: conflictRows.map((r) => ({
        id: r.id,
        severity: r.severity,
        status: r.status,
        conflictCode: r.conflictCode,
      })),
      anchorEntityId,
    };
  });
}

export async function countEntitiesByStatus(
  client: Sql,
  tenantId: string,
  status: string,
): Promise<number> {
  const rows = await withTenantTransaction(client, tenantId, async (db) => {
    return db
      .select({ id: qumEntities.id })
      .from(qumEntities)
      .where(and(eq(qumEntities.tenantId, tenantId), eq(qumEntities.status, status)));
  });
  return rows.length;
}

export async function countOfiCustomers(client: Sql): Promise<number> {
  const rows = await client<{ count: string }[]>`
    SELECT count(*)::text AS count FROM ofi_customers
  `.catch(() => [{ count: "0" }]);
  return Number(rows[0]?.count ?? "0");
}

export async function listOpenBlockingConflicts(client: Sql, tenantId: string) {
  return withTenantTransaction(client, tenantId, async (db) => {
    return db
      .select()
      .from(qumConflicts)
      .where(
        and(
          eq(qumConflicts.tenantId, tenantId),
          eq(qumConflicts.severity, "BLOCKING"),
          eq(qumConflicts.status, "OPEN"),
        ),
      );
  });
}

export async function attachDecisionToEntityProvenance(
  client: Sql,
  tenantId: string,
  entityId: string,
  decisionId: string,
): Promise<void> {
  await withTenantTransaction(client, tenantId, async (db) => {
    const rows = await db
      .select({ id: qumProvenanceEntries.id })
      .from(qumProvenanceEntries)
      .where(
        and(
          eq(qumProvenanceEntries.tenantId, tenantId),
          eq(qumProvenanceEntries.entityId, entityId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      return;
    }
    await db
      .update(qumProvenanceEntries)
      .set({ decisionId, originKind: "HUMAN_DECISION" })
      .where(eq(qumProvenanceEntries.id, row.id));
  });
}