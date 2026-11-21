export const FACTURA_CI_DISCLAIMER =
  "Factura CI ejecuta pruebas conductuales sintéticas contra un simulador local determinista. Aprobar esta suite NO constituye certificación ni validación oficial del Ministerio de Hacienda de Costa Rica." as const;

export const ERR_SEC_LOOPBACK_ONLY = "ERR_SEC_LOOPBACK_ONLY" as const;
export const ERR_SUT_UNREACHABLE = "ERR_SUT_UNREACHABLE" as const;
export const ERR_SUITE_EXECUTION_TIMEOUT = "ERR_SUITE_EXECUTION_TIMEOUT" as const;

export type ScenarioId =
  | `FC-${string}`
  | "FC-031";

export const ALL_SCENARIO_IDS = [
  "FC-001",
  "FC-002",
  "FC-003",
  "FC-004",
  "FC-005",
  "FC-006",
  "FC-007",
  "FC-008",
  "FC-009",
  "FC-010",
  "FC-011",
  "FC-012",
  "FC-013",
  "FC-014",
  "FC-015",
  "FC-016",
  "FC-017",
  "FC-018",
  "FC-019",
  "FC-020",
  "FC-021",
  "FC-022",
  "FC-023",
  "FC-024",
  "FC-031",
] as const;

export type CanonicalScenarioId = (typeof ALL_SCENARIO_IDS)[number];

export type SuiteFilter =
  | "all"
  | "concurrency"
  | "recovery"
  | "isolation"
  | "states"
  | "xml";