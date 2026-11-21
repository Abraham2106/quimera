export {
  ERR_ARTIFACT_HASH_MISMATCH,
  ERR_PIPELINE_CONTRACT_MISMATCH,
  ERR_PIPELINE_INVALID_DAG,
  PipelineError,
  isPipelineError,
} from "./errors.js";

export { validateDag, topoSort } from "./dag.js";
export {
  validateDagAndContracts,
  validateStepContracts,
} from "./contracts.js";
export { computeStepInputHash } from "./input-hash.js";
export {
  parsePipelineJson,
  parsePipelineManifest,
  normalizePipelineDefinition,
} from "./parse.js";
export {
  runPipeline,
  resumePipeline,
  executePipeline,
  validatePipelineDefinition,
} from "./runner.js";
export {
  createPipelineSql,
  createExecutionRun,
  updateExecutionRunStatus,
  upsertCheckpoint,
  getExecutionRun,
  listCheckpoints,
} from "./store/postgres.js";

export type {
  CheckpointRecord,
  CheckpointStatus,
  ExecutionRunRecord,
  ExecutionRunStatus,
  PipelineDefinition,
  PipelineExecutionResult,
  PipelineStepDef,
  ResumePipelineOptions,
  RunContext,
  RunPipelineOptions,
  StepContractRef,
  StepExecuteResult,
  StepExecutionRequest,
  StepRegistry,
  StepRegistryEntry,
} from "./types.js";

export {
  PIPELINE_EXIT_ERROR,
  PIPELINE_EXIT_SUCCESS,
  PIPELINE_EXIT_WAITING_APPROVAL,
  PIPELINE_MODULE,
} from "./constants.js";

export { runCli } from "./cli.js";

export const PIPELINE_PACKAGE = "@quimera/pipeline" as const;