const seenReplayKeys = new Map<string, number>();

export function billingWebhookToleranceSeconds(): number {
  const configured = process.env.BILLING_WEBHOOK_TOLERANCE_SECONDS?.trim();
  if (configured) {
    const parsed = Number(configured);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return 300;
}

export function parseWebhookTimestamp(header: string | undefined): number | null {
  if (!header?.trim()) {
    return null;
  }
  const parsed = Number(header.trim());
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

export function isWebhookTimestampFresh(
  timestampSec: number,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const tolerance = billingWebhookToleranceSeconds();
  return Math.abs(nowSec - timestampSec) <= tolerance;
}

function replayStorageKey(timestampSec: number, signature: string): string {
  return `${timestampSec}:${signature.toLowerCase()}`;
}

function pruneExpiredReplayKeys(nowSec: number): void {
  for (const [key, expiresAt] of seenReplayKeys) {
    if (expiresAt <= nowSec) {
      seenReplayKeys.delete(key);
    }
  }
}

/** Returns true when the same timestamp+signature was already accepted inside the retention window. */
export function isWebhookReplay(timestampSec: number, signature: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  pruneExpiredReplayKeys(now);
  return seenReplayKeys.has(replayStorageKey(timestampSec, signature));
}

export function recordWebhookDelivery(timestampSec: number, signature: string): void {
  const expiresAt = timestampSec + billingWebhookToleranceSeconds();
  seenReplayKeys.set(replayStorageKey(timestampSec, signature), expiresAt);
}

export function resetWebhookReplayStoreForTests(): void {
  seenReplayKeys.clear();
}