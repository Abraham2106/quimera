import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Adaptador determinista: HMAC-SHA256 sobre `timestamp + "." + rawBody` (utf-8 prefix, bytes del cuerpo).
 * La marca `timestamp` es unix en segundos y va también en la cabecera `x-quimera-timestamp`.
 */
export function signWebhookBody(raw: Uint8Array, secret: string, timestampSec: number): string {
  const prefix = Buffer.from(`${timestampSec}.`, "utf8");
  const material = Buffer.concat([prefix, Buffer.from(raw)]);
  return createHmac("sha256", secret).update(material).digest("hex");
}

export function verifyWebhookHmac(
  raw: Uint8Array,
  signature: string | undefined,
  secret: string,
  timestampSec: number,
): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const expected = signWebhookBody(raw, secret, timestampSec);
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(signature, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function billingWebhookSecret(): string | null {
  const configured = process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "test" || process.env.OFICIOS_AUTH_MODE === "test-headers") {
    return "quimera-test-webhook-secret";
  }
  return null;
}