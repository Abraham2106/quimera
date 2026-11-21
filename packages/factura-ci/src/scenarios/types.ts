import type { CanonicalScenarioId, SuiteFilter } from "../constants.js";
import type { SimulatorHandle, SimulatorResponseMode } from "../simulator/index.js";
import type { FiscalSut } from "../types/fiscal-sut.js";

export interface ScenarioContext {
  readonly sut: FiscalSut;
  readonly simulator: SimulatorHandle;
  readonly seed: number;
}

export interface ScenarioResult {
  readonly id: CanonicalScenarioId;
  readonly passed: boolean;
  readonly message: string;
  readonly family: string;
  readonly suite: SuiteFilter[];
}

export interface ScenarioDefinition {
  readonly id: CanonicalScenarioId;
  readonly family: string;
  readonly suites: SuiteFilter[];
  readonly mode: SimulatorResponseMode;
  run: (ctx: ScenarioContext) => Promise<ScenarioResult>;
}

export interface RunSuiteOptions {
  readonly createSut: () => FiscalSut;
  readonly simulator: SimulatorHandle;
  readonly seed?: number;
  readonly suite?: SuiteFilter;
  readonly only?: readonly CanonicalScenarioId[];
}

export interface SuiteRunReport {
  readonly disclaimer: string;
  readonly seed: number;
  readonly target: string;
  readonly results: readonly ScenarioResult[];
  readonly passed: number;
  readonly failed: number;
  readonly exitCode: 0 | 1;
}