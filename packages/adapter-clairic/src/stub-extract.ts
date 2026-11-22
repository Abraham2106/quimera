import type { StructuredExtractorFieldMeta } from "@quimera/core";

import { PROMPT_INJECTION_FIXTURE } from "./constants.js";
import {
  defaultStubConfidence,
  isFiscalFieldName,
  type ClairicFieldMetaExtensions,
} from "./low-confidence.js";

export type ClairicFieldMeta = StructuredExtractorFieldMeta &
  ClairicFieldMetaExtensions;

type JsonSchemaNode = Record<string, unknown>;

function schemaType(node: JsonSchemaNode): string | undefined {
  const type = node.type;
  return typeof type === "string" ? type : undefined;
}

function schemaProperties(
  node: JsonSchemaNode,
): Record<string, JsonSchemaNode> | undefined {
  const properties = node.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return undefined;
  }
  return properties as Record<string, JsonSchemaNode>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringFieldValue(fieldName: string, text: string): string {
  const lower = fieldName.toLowerCase();
  if (
    lower.includes("note") ||
    lower.includes("text") ||
    lower.includes("body") ||
    lower.includes("content") ||
    lower.includes("instruction") ||
    lower.includes("raw")
  ) {
    return text;
  }
  const match = new RegExp(
    `${escapeRegExp(fieldName)}\\s*[:=]\\s*([^\\n]+)`,
    "i",
  ).exec(text);
  if (match?.[1]) {
    return match[1].trim();
  }
  return "";
}

function numberFieldValue(fieldName: string, text: string): number | null {
  const pattern = new RegExp(
    `${escapeRegExp(fieldName)}\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)`,
    "i",
  );
  const match = pattern.exec(text);
  if (match?.[1]) {
    return Number(match[1]);
  }
  return null;
}

function fillValueFromSchema(
  schema: JsonSchemaNode,
  text: string,
  path: string[] = [],
): { value: unknown; fields: Record<string, ClairicFieldMeta> } {
  const type = schemaType(schema);
  const properties = schemaProperties(schema);
  const fields: Record<string, ClairicFieldMeta> = {};
  const confidenceProfile = defaultStubConfidence(text);

  if (type === "object" && properties) {
    const value: Record<string, unknown> = {};
    for (const [name, childSchema] of Object.entries(properties)) {
      const child = fillValueFromSchema(childSchema, text, [...path, name]);
      const childType = schemaType(childSchema);
      if (name.toLowerCase() === "approved" && childType === "boolean") {
        value[name] = false;
      } else {
        value[name] = child.value;
      }
      Object.assign(fields, child.fields);
    }

    if (text.includes(PROMPT_INJECTION_FIXTURE)) {
      const stringProp = Object.entries(properties).find(
        ([, child]) => schemaType(child) === "string",
      );
      if (stringProp) {
        value[stringProp[0]] = text;
      }
    }

    return { value, fields };
  }

  const fieldPath = path.join(".");
  if (type === "string") {
    const leafName = path.at(-1) ?? "value";
    const str = stringFieldValue(leafName, text);
    fields[fieldPath || leafName] = buildFieldMeta(
      leafName,
      confidenceProfile,
      str.length > 0,
    );
    return { value: str, fields };
  }

  if (type === "number" || type === "integer") {
    const leafName = path.at(-1) ?? "value";
    const num = numberFieldValue(leafName, text);
    fields[fieldPath || leafName] = buildFieldMeta(
      leafName,
      confidenceProfile,
      num !== null,
    );
    return { value: num, fields };
  }

  if (type === "boolean") {
    const leafName = path.at(-1) ?? "value";
    fields[fieldPath || leafName] = buildFieldMeta(
      leafName,
      confidenceProfile,
      true,
    );
    return { value: false, fields };
  }

  return { value: null, fields };
}

function buildFieldMeta(
  fieldName: string,
  confidenceProfile: ReturnType<typeof defaultStubConfidence>,
  complete: boolean,
): ClairicFieldMeta {
  const fiscal = isFiscalFieldName(fieldName);
  const meta: ClairicFieldMeta = {
    confidence: confidenceProfile.confidence,
    pNull: confidenceProfile.pNull,
    valid: true,
    complete,
    ...(confidenceProfile.lowConfidence ? { lowConfidence: true } : {}),
    ...(fiscal ? { requiresHumanReview: true } : {}),
  };
  return meta;
}

export function stubExtractFromSchema(
  schema: Record<string, unknown>,
  text: string,
): { value: unknown; fields: Record<string, ClairicFieldMeta> } {
  const safeText = text ?? "";
  return fillValueFromSchema(schema as JsonSchemaNode, safeText);
}