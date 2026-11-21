import { createHash } from "node:crypto";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normaliza un valor JSON a forma canónica: objetos con claves ordenadas,
 * sin dependencia del orden de inserción.
 */
export function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const sortedKeys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    out[key] = canonicalizeJsonValue(value[key]);
  }
  return out;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

export function sha256CanonicalJson(value: unknown): string {
  const canonical = canonicalJsonString(value);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}