import { signWebhookBody } from "../../src/api/billing/hmac.js";

export function signedBillingWebhookHeaders(
  raw: Uint8Array,
  secret: string,
  timestampSec?: number,
): Record<string, string> {
  const timestamp = timestampSec ?? Math.floor(Date.now() / 1000);
  return {
    "content-type": "application/json",
    "x-quimera-timestamp": String(timestamp),
    "x-quimera-signature": signWebhookBody(raw, secret, timestamp),
  };
}