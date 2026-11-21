export {
  FACTURA_CI_DISCLAIMER,
  ALL_SCENARIO_IDS,
  ERR_SEC_LOOPBACK_ONLY,
  ERR_SUT_UNREACHABLE,
} from "./constants.js";
export { FacturaCiError } from "./errors.js";
export {
  startSimulator,
  assertLoopbackHost,
  parseTargetUrl,
  createSeededRng,
} from "./simulator/index.js";
export type {
  SimulatorHandle,
  SimulatorResponseMode,
  SimulatorRequestLogEntry,
} from "./simulator/index.js";
export type { FiscalSut, FiscalEmitInput, FiscalEmitResult } from "./types/fiscal-sut.js";
export { createBuggySut, createCompliantSut } from "./sut-fixtures/index.js";
export { validateXml, minimalStructuralCheck } from "./xml-validation.js";
export { SCENARIO_DEFINITIONS, listScenarios } from "./scenarios/registry.js";
export { runScenarioSuite } from "./scenarios/runner.js";
export type { SuiteRunReport, ScenarioResult } from "./scenarios/types.js";
export { formatJsonReport } from "./reporters/json.js";
export { formatPrettyReport } from "./reporters/pretty.js";
export { formatJunitReport } from "./reporters/junit.js";
export { runFacturaCiCli, printScenarioList } from "./cli.js";