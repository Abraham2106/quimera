/** Redacción centralizada de material sensible del vault fiscal. */

export const FISCAL_REDACTED = "[redacted]";

const SENSITIVE_KEY_NAMES = new Set([
  "idppassword",
  "password",
  "passwd",
  "pwd",
  "pin",
  "p12",
  "p12base64",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "clientsecret",
  "authorization",
  "apikey",
  "privatekey",
  "kek",
  "dekwrapped",
]);

const SENSITIVE_KEY_SUFFIXES = [
  "password",
  "token",
  "secret",
  "apikey",
  "credential",
  "authorization",
];

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Detecta claves como `idpPassword`, `idp_password`, `p12Base64`, `token` o `secret`. */
export function isFiscalSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  if (SENSITIVE_KEY_NAMES.has(normalized)) {
    return true;
  }
  return SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function redactValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return FISCAL_REDACTED;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactFiscalSecrets(value.message) };
  }
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(value, output);
    for (const item of value) {
      output.push(redactValue(item, seen));
    }
    return output;
  }
  const output: Record<string, unknown> = {};
  seen.set(value, output);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isFiscalSensitiveKey(key)
      ? FISCAL_REDACTED
      : redactValue(item, seen);
  }
  return output;
}

/** Copia estructural segura para logs: sustituye valores de claves sensibles y buffers. */
export function redactFiscalObject(value: unknown): unknown {
  return redactValue(value, new WeakMap());
}

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(idp_?password|password|passphrase|pin|p12(?:_?base64)?|token|secret|api_?key|authorization)\b(\s*["']?\s*[:=]\s*["']?)([^\s,;"'}\]]+)/gi;

/** Redacción de mensajes de texto (incluye JSON serializado y cabeceras Bearer). */
export function redactFiscalSecrets(message: string): string {
  return message
    .replace(BEARER_PATTERN, `Bearer ${FISCAL_REDACTED}`)
    .replace(
      SECRET_ASSIGNMENT_PATTERN,
      (_match, key: string, separator: string) => `${key}${separator}${FISCAL_REDACTED}`,
    );
}

/** Serializa un evento de log aplicando redacción estructurada y textual. */
export function redactFiscalLog(event: unknown): string {
  return redactFiscalSecrets(JSON.stringify(redactFiscalObject(event)) ?? "");
}
