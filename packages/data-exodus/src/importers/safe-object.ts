import { canonicalizeJsonValue, sha256CanonicalJson } from "@quimera/core";

/**
 * claves que no pueden convertirse en propiedad de un objeto normal sin
 * alterar su prototipo. Las filas crudas se construyen con `Object.create(null)`
 * y además se rechazan estas claves antes de pasar por la serialización canónica.
 */
const UNSAFE_KEYS = new Set(["__proto__"]);

export function isUnsafeObjectKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}

export function assertSafeObjectKey(key: string): void {
  if (isUnsafeObjectKey(key)) {
    throw new Error(`ERR_UNSAFE_OBJECT_KEY: ${key}`);
  }
}

export function createSafeRecord<V = unknown>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}

function assertSafeObjectTree(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafeObjectTree(item, seen);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    assertSafeObjectKey(key);
    assertSafeObjectTree((value as Record<string, unknown>)[key], seen);
  }
}

/** Verifica recursivamente que ningún objeto contenga claves que contaminen prototipos. */
export function assertSafeObjectTreeKeys(value: unknown): void {
  assertSafeObjectTree(value, new Set<object>());
}

export function canonicalizeSafeJsonValue(value: unknown): unknown {
  assertSafeObjectTreeKeys(value);
  return canonicalizeJsonValue(value);
}

export function sha256SafeCanonicalJson(value: unknown): string {
  assertSafeObjectTreeKeys(value);
  return sha256CanonicalJson(value);
}

/**
 * Convierte los registros `Object.create(null)` a objetos literales antes de
 * pasarlos a Drizzle, que comprueba `value.constructor` al enlazar columnas.
 */
export function toPlainJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toPlainJson(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = toPlainJson(item);
    }
    return out as T;
  }
  return value;
}
