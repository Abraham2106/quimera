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
export {
  artifactSha256,
  ResumeArtifactHashError,
  runResumableBatch,
  type ResumableBatchResult,
  type ResumableCheckpoint,
} from "./migrate/resumable-batch.js";
export {
  loadDemoHvacTabularSources,
  OFICIOS_V1_TARGET,
  profileTables,
  proposeMapping,
  renderMappingYaml,
  type MappingColumn,
  type MappingProposal,
  type SchemaProfile,
  type TabularSource,
} from "./profile/index.js";
export { trace, type TraceResult } from "./profile/index.js";
export { assertFeXmlSafeForParsing } from "./importers/fe-xml.js";
export { assertXlsxZipNotBomb } from "./importers/xlsx.js";
export {
  CsvSourceImporter,
  JsonSourceImporter,
  SqliteSourceImporter,
  neutralizeCsvExportRow,
  neutralizeCsvFormulaPrefix,
  type CsvImportRequest,
  type CsvSourceImporterOptions,
  type ImportCounts,
  type SourceImporterPort,
  type SourceImportSummary,
} from "./importers/index.js";
export {
  loadDemoHvac1000,
  persistDemoHvacToOficios,
  persistDemoHvacToOficiosFromEnv,
  resolveDemoHvacFixtureRoot,
  type LoadDemoHvac1000Result,
  type PersistDemoHvacResult,
} from "./demo/index.js";