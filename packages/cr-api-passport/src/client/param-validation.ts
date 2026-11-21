import type { ApiPassport } from "../schema/api-passport.js";
import { PASSPORT_ERROR_CODES, quimeraError } from "../errors.js";
import type { QuimeraError } from "@quimera/core";

export function validateOperationParams(
  passport: ApiPassport,
  operationName: string,
  params: Record<string, string>,
): QuimeraError | null {
  const op = passport.operations[operationName];
  if (!op) {
    return quimeraError(
      PASSPORT_ERROR_CODES.INVALID_INPUT,
      "VALIDATION",
      `Unknown operation: ${operationName}`,
      false,
      { operation: operationName },
    );
  }
  const specs = op.queryParams ?? {};
  for (const [name, spec] of Object.entries(specs)) {
    const value = params[name];
    if (spec.required && (value === undefined || value === "")) {
      return quimeraError(
        PASSPORT_ERROR_CODES.INVALID_INPUT,
        "VALIDATION",
        `Missing required query parameter: ${name}`,
        false,
        { param: name },
      );
    }
    if (value === undefined) {
      continue;
    }
    if (spec.type === "string") {
      if (spec.minLength !== undefined && value.length < spec.minLength) {
        return quimeraError(
          PASSPORT_ERROR_CODES.INVALID_INPUT,
          "VALIDATION",
          `Parameter ${name} must be at least ${spec.minLength} characters`,
          false,
          { param: name, minLength: spec.minLength },
        );
      }
      if (spec.pattern) {
        const re = new RegExp(spec.pattern);
        if (!re.test(value)) {
          return quimeraError(
            PASSPORT_ERROR_CODES.INVALID_INPUT,
            "VALIDATION",
            `Parameter ${name} does not match pattern ${spec.pattern}`,
            false,
            { param: name, pattern: spec.pattern },
          );
        }
      }
    }
    if (spec.type === "integer" || spec.type === "number") {
      const n = Number(value);
      if (Number.isNaN(n)) {
        return quimeraError(
          PASSPORT_ERROR_CODES.INVALID_INPUT,
          "VALIDATION",
          `Parameter ${name} must be numeric`,
          false,
          { param: name },
        );
      }
    }
  }
  return null;
}