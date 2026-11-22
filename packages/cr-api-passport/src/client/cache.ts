import { createHash } from "node:crypto";

export type CacheEntry<T> = {
  readonly value: T;
  readonly expiresAtMs: number;
  readonly storedAtMs: number;
};

export type QueryCacheKeyInput = {
  readonly passportId: string;
  readonly passportVersion: string;
  readonly operation: string;
  readonly params: Record<string, string>;
};

export function cacheKey(input: QueryCacheKeyInput): string {
  const sorted = Object.keys(input.params)
    .sort()
    .map((k) => `${k}=${input.params[k]}`)
  .join("&");
  const raw = `${input.passportId}|${input.passportVersion}|${input.operation}|${sorted}`;
  return createHash("sha256").update(raw).digest("hex");
}

export class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock;
  }

  get(key: string): CacheEntry<T> | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.clock() > entry.expiresAtMs) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, value: T, ttlSec: number): CacheEntry<T> {
    const now = this.clock();
    const entry: CacheEntry<T> = {
      value,
      storedAtMs: now,
      expiresAtMs: now + ttlSec * 1000,
    };
    this.store.set(key, entry);
    return entry;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}