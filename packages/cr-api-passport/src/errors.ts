import { randomUUID } from "node:crypto";
import type { QuimeraError } from "@quimera/core";

export const MODULE_NAME = "@quimera/cr-api-passport" as const;

export const PASSPORT_ERROR_CODES = {
  INVALID_INPUT: "ERR_PASS_INVALID_INPUT",
  AUTH_MISSING: "ERR_AUTH_MISSING_CREDENTIALS",
  NOT_FOUND: "ERR_PASS_NOT_FOUND",
  RATE_LIMITED: "ERR_PASS_RATE_LIMITED",
  UPSTREAM_UNAVAILABLE: "ERR_PASS_UPSTREAM_UNAVAILABLE",
  CONTRACT_DRIFT: "ERR_PASSPORT_CONTRACT_DRIFT",
} as const;

export function quimeraError(
  code: string,
  category: QuimeraError["category"],
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
): QuimeraError {
  return {
    code,
    category,
    message,
    retryable,
    correlationId: randomUUID(),
    module: MODULE_NAME,
    ...(details ? { details } : {}),
  };
}

export function exitCodeForError(code: string): number {
  if (code === PASSPORT_ERROR_CODES.AUTH_MISSING) {
    return 4;
  }
  if (code === PASSPORT_ERROR_CODES.CONTRACT_DRIFT) {
    return 5;
  }
  return 1;
}