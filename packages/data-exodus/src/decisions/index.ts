export { DataExodusError, type DataExodusErrorCode } from "./errors.js";
export {
  applyDecision,
  applyDecisionById,
  hasActiveDecision,
} from "./apply-decision.js";
export type {
  ApplyDecisionOptions,
  ApplyDecisionResult,
  ConflictRow,
  ResolutionAction,
} from "./types.js";