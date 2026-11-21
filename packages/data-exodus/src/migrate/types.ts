export type ReconciliationReport = {
  tenantId: string;
  batchId?: string;
  dryRun: boolean;
  generatedAt: string;
  destination: "ofi_customers" | "qum_entities_only";
  entitiesEligible: number;
  entitiesLoaded: number;
  entitiesMigratedInQum: number;
  entitiesQuarantined: number;
  ofiCustomersInserted: number;
  conflicts: {
    openBlocking: number;
    resolvedHuman: number;
    unreconcilable: number;
  };
  checksums: {
    verifiedEntityCount: number;
    migratedEntityCount: number;
  };
};

export type MigrateVerifiedOptions = {
  tenantId: string;
  batchId?: string;
  dryRun?: boolean;
  /** Crea tablas ofi_* mínimas si no existen (solo para entornos de prueba). */
  ensureMinimalOfiTables?: boolean;
};

export class MigrateDryRunRollback extends Error {
  readonly report: ReconciliationReport;

  constructor(report: ReconciliationReport) {
    super("dry-run rollback");
    this.name = "MigrateDryRunRollback";
    this.report = report;
  }
}