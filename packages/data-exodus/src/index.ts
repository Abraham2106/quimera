import { QUIMERA_CORE_VERSION } from "@quimera/core";

export const DATA_EXODUS_MODULE = "data-exodus" as const;

export type DataExodusBootstrap = {
  readonly module: typeof DATA_EXODUS_MODULE;
  readonly coreVersion: typeof QUIMERA_CORE_VERSION;
};

export function dataExodusBootstrap(): DataExodusBootstrap {
  return {
    module: DATA_EXODUS_MODULE,
    coreVersion: QUIMERA_CORE_VERSION,
  };
}

export {
  applyDecision,
  applyDecisionById,
  DataExodusError,
  type ApplyDecisionOptions,
  type ApplyDecisionResult,
  type DataExodusErrorCode,
} from "./decisions/index.js";
export {
  migrateVerified,
  type MigrateVerifiedOptions,
  type ReconciliationReport,
} from "./migrate/index.js";
export { trace, type TraceResult } from "./profile/index.js";
export {
  CsvSourceImporter,
  neutralizeCsvExportRow,
  neutralizeCsvFormulaPrefix,
  type CsvImportRequest,
  type CsvSourceImporterOptions,
  type ImportCounts,
  type SourceImporterPort,
  type SourceImportSummary,
} from "./importers/index.js";