import type { JsonSchemaNode } from "./api-passport.js";

export type SchemaValidationIssue = {
  readonly path: string;
  readonly expected: string;
  readonly observed: string;
};

export function validateAgainstJsonSchema(
  value: unknown,
  schema: JsonSchemaNode,
  basePath = "$",
): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];

  if (schema.type === "object" || schema.properties !== undefined) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      issues.push({
        path: basePath,
        expected: "object",
        observed: value === null ? "null" : typeof value,
      });
      return issues;
    }
    const obj = value as Record<string, unknown>;
    const required = (schema.required as string[] | undefined) ?? [];
    for (const key of required) {
      if (!(key in obj)) {
        issues.push({
          path: `${basePath}.${key}`,
          expected: "required field present",
          observed: "missing",
        });
      }
    }
    const props = (schema.properties as Record<string, JsonSchemaNode> | undefined) ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) {
        issues.push(...validateAgainstJsonSchema(obj[key], sub, `${basePath}.${key}`));
      }
    }
    return issues;
  }

  if (schema.type === "array" || schema.items !== undefined) {
    if (!Array.isArray(value)) {
      issues.push({
        path: basePath,
        expected: "array",
        observed: value === null ? "null" : typeof value,
      });
      return issues;
    }
    const itemSchema = schema.items as JsonSchemaNode | undefined;
    if (itemSchema) {
      value.forEach((item, i) => {
        issues.push(...validateAgainstJsonSchema(item, itemSchema, `${basePath}[${i}]`));
      });
    }
    return issues;
  }

  const t = schema.type as string | undefined;
  if (t === "string") {
    if (typeof value !== "string") {
      issues.push({ path: basePath, expected: "string", observed: typeof value });
    } else {
      const pattern = schema.pattern as string | undefined;
      if (pattern && !new RegExp(pattern).test(value)) {
        issues.push({
          path: basePath,
          expected: `string matching /${pattern}/`,
          observed: JSON.stringify(value),
        });
      }
      const minLength = schema.minLength as number | undefined;
      if (minLength !== undefined && value.length < minLength) {
        issues.push({
          path: basePath,
          expected: `minLength ${minLength}`,
          observed: String(value.length),
        });
      }
    }
    return issues;
  }

  if (t === "integer" || t === "number") {
    if (typeof value !== "number" || (t === "integer" && !Number.isInteger(value))) {
      issues.push({
        path: basePath,
        expected: t,
        observed: typeof value === "number" ? String(value) : typeof value,
      });
    } else {
      const min = (schema.minimum as number | undefined) ?? (schema.min as number | undefined);
      const max = (schema.maximum as number | undefined) ?? (schema.max as number | undefined);
      if (min !== undefined && value < min) {
        issues.push({ path: basePath, expected: `>= ${min}`, observed: String(value) });
      }
      if (max !== undefined && value > max) {
        issues.push({ path: basePath, expected: `<= ${max}`, observed: String(value) });
      }
    }
    return issues;
  }

  return issues;
}