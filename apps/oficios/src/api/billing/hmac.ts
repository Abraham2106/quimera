import { createHmac, timingSafeEqual } from "node:crypto";

/** Adaptador determinista: firma el cuerpo crudo sin llamar a una pasarela. */
export function signWebhookBody(raw: Uint8Array, secret: string): string {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

export function verifyWebhookHmac(raw: Uint8Array, signature: string | undefined, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const expected = signWebhookBody(raw, secret);
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
