import type { ConflictCode } from "@quimera/core";

import { FISCAL_FIELD_NAMES } from "./constants.js";

export interface ConfidenceGateMeta {
  readonly confidence: number;
  readonly pNull: number;
}

export interface ClairicFieldMetaExtensions {
  readonly lowConfidence?: boolean;
  readonly requiresHumanReview?: boolean;
}

const CONFIDENCE_THRESHOLD = 0.9;
const P_NULL_THRESHOLD = 0.15;

export function lowConfidenceConflict(
  meta: ConfidenceGateMeta,
): ConflictCode | null {
  if (meta.confidence < CONFIDENCE_THRESHOLD || meta.pNull > P_NULL_THRESHOLD) {
    return "AI_LOW_CONFIDENCE";
  }
  return null;
}

export function isFiscalFieldName(fieldName: string): boolean {
  return FISCAL_FIELD_NAMES.has(fieldName.toLowerCase());
}

export function defaultStubConfidence(text: string): {
  confidence: number;
  pNull: number;
  lowConfidence: boolean;
} {
  if (text.includes("CONFIDENCE_LOW")) {
    return { confidence: 0.72, pNull: 0.2, lowConfidence: true };
  }
  return { confidence: 0.95, pNull: 0.05, lowConfidence: false };
}