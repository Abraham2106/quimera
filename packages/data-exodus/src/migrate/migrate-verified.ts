import { and, eq, inArray, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { type QuimeraDb, withTenantTransaction } from "../db/connection.js";
import { qumConflicts, qumEntities } from "../db/schema/index.js";
import { DataExodusError } from "../decisions/errors.js";
import { ensureMinimalOfiTables, ofiCustomersTableExists } from "./destination.js";
import { listOpenBlockingConflictIds } from "./open-blocking.js";
import { MigrateDryRunRollback, type MigrateVerifiedOptions, type ReconciliationReport } from "./types.js";

type CustomerCanonical = {
  legalName?: string;
  taxId?: string;
};

async function countConflictSummary(db: QuimeraDb, tenantId: string) {
  const rows = await db
    .select({
      status: qumConflicts.status,
      severity: qumConflicts.severity,
    })
    .from(qumConflicts)
    .where(eq(qumConflicts.tenantId, tenantId));

  let openBlocking = 0;
  let unreconcilable = 0;
  let resolvedHuman = 0;
  for (const row of rows) {
    if (row.severity === "BLOCKING" && row.status === "OPEN") {
      openBlocking += 1;
    }
    if (row.status === "UNRECONCILABLE") {
      unreconcilable += 1;
    }
    if (row.status === "RESOLVED" && row.severity === "BLOCKING") {
      resolvedHuman += 1;
    }
  }
  return { openBlocking, unreconcilable, resolvedHuman };
}

async function executeMigrate(
  db: QuimeraDb,
  options: MigrateVerifiedOptions,
): Promise<ReconciliationReport> {
  const { tenantId, batchId, dryRun = false, ensureMinimalOfiTables: ensureTables = false } =
    options;

  const verified = await db
    .select()
    .from(qumEntities)
    .where(and(eq(qumEntities.tenantId, tenantId), eq(qumEntities.status, "VERIFIED")));

  const blocked = await db
    .select({ id: qumEntities.id })
    .from(qumEntities)
    .where(and(eq(qumEntities.tenantId, tenantId), eq(qumEntities.status, "BLOCKED")));

  let useOfi = await ofiCustomersTableExists(db);
  if (!useOfi && ensureTables) {
    await ensureMinimalOfiTables(db);
    useOfi = await ofiCustomersTableExists(db);
  }
  if (useOfi) {
    const tenantRows = await db.execute<{ id: string }>(
      sql`SELECT id::text AS id FROM qum_tenants WHERE id = ${tenantId}::uuid`,
    );
    if ((tenantRows as { id?: string }[]).length === 0) {
      useOfi = false;
    }
  }

  let ofiCustomersInserted = 0;
  const migratedIds: string[] = [];

  const customerEntities = verified.filter((e) => e.entityType === "customer");
  for (const entity of customerEntities) {
    migratedIds.push(entity.id);
    if (useOfi) {
      const data = entity.canonicalData as CustomerCanonical;
      await db.execute(sql`
        INSERT INTO ofi_customers (id, tenant_id, legal_name, tax_id, provenance_entity_id)
        VALUES (
          ${entity.id}::uuid,
          ${tenantId}::uuid,
          ${data.legalName ?? entity.naturalKey ?? "unknown"},
          ${data.taxId ?? null},
          ${entity.id}::uuid
        )
      `);
      ofiCustomersInserted += 1;
    }
  }

  if (migratedIds.length > 0) {
    await db
      .update(qumEntities)
      .set({ status: "MIGRATED", updatedAt: new Date() })
      .where(
        and(eq(qumEntities.tenantId, tenantId), inArray(qumEntities.id, migratedIds)),
      );
  }

  const conflictSummary = await countConflictSummary(db, tenantId);

  const report: ReconciliationReport = {
    tenantId,
    batchId,
    dryRun,
    generatedAt: new Date().toISOString(),
    destination: useOfi ? "ofi_customers" : "qum_entities_only",
    entitiesEligible: verified.length,
    entitiesLoaded: useOfi ? ofiCustomersInserted : migratedIds.length,
    entitiesMigratedInQum: migratedIds.length,
    entitiesQuarantined: blocked.length,
    ofiCustomersInserted,
    conflicts: conflictSummary,
    checksums: {
      verifiedEntityCount: verified.length,
      migratedEntityCount: migratedIds.length,
    },
  };

  if (report.entitiesEligible !== report.checksums.verifiedEntityCount) {
    throw new DataExodusError("ERR_DATA_COUNT_MISMATCH", "Entity count invariant failed");
  }

  if (dryRun) {
    throw new MigrateDryRunRollback(report);
  }

  return report;
}

/**
 * Migra entidades VERIFIED al esquema destino. Falla si hay conflictos BLOCKING abiertos.
 */
export async function migrateVerified(
  client: Sql,
  options: MigrateVerifiedOptions,
): Promise<ReconciliationReport> {
  const openBlocking = await listOpenBlockingConflictIds(client, options.tenantId);
  if (openBlocking.length > 0) {
    throw new DataExodusError(
      "ERR_MIGRATION_BLOCKED_BY_CONFLICTS",
      `${openBlocking.length} open BLOCKING conflict(s) prevent migration`,
      {
        retryable: false,
        details: { conflictIds: openBlocking },
      },
    );
  }

  try {
    return await withTenantTransaction(client, options.tenantId, async (db) =>
      executeMigrate(db, options),
    );
  } catch (error) {
    if (error instanceof MigrateDryRunRollback) {
      return error.report;
    }
    throw error;
  }
}