import type { Decision } from "../db/repositories/decisions.js";

export type ResolutionAction =
  | "MERGE"
  | "KEEP_SEPARATE"
  | "OVERRIDE_FIELD"
  | "REJECT_RECORD"
  | "MARK_UNRECONCILABLE"
  | "DEFER";

export type ConflictRow = {
  id: string;
  tenantId: string;
  conflictCode: string;
  severity: string;
  status: string;
  candidateEntityIds: string[];
};

export type ApplyDecisionOptions = {
  actorType?: "HUMAN" | "RULE";
  payload?: Record<string, unknown>;
  supersedesDecisionId?: string;
};

export type ApplyDecisionResult = {
  decision: Decision;
  conflictStatus: string;
};
