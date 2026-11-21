export { trace, type TraceDecisionRef, type TraceProvenanceNode, type TraceResult } from "./trace.js";
export { loadDemoHvacTabularSources } from "./load-tabular.js";
export {
  OFICIOS_V1_REQUIRED,
  OFICIOS_V1_TARGET,
  proposeMapping,
  renderMappingYaml,
} from "./mapping.js";
export { columnByName, profileTables } from "./profiler.js";
export type {
  ColumnPattern,
  ColumnProfile,
  MappingColumn,
  MappingProposal,
  MappingStatus,
  SchemaProfile,
  SourceProfile,
  TabularSource,
} from "./types.js";