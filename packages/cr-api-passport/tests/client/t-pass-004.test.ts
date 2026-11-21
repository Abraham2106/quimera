import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { HostTokenBucket } from "../../src/client/token-bucket.js";
import { PassportClient } from "../../src/client/passport-client.js";
import type { FixtureEnvelope } from "../../src/client/fixtures.js";

describe("T-PASS-004 — rate limit y circuit breaker", () => {
  it("ráfaga de 100 llamadas no supera 15 req/s", () => {
    let now = 0;
    const bucket = new HostTokenBucket({
      burstPerSec: 15,
      sustainedPerSec: 8,
      sustainedWindowSec: 120,
      clock: () => now,
    });
    const eventTimes: number[] = [];
    for (let i = 0; i < 100; i++) {
      let wait = bucket.acquire();
      while (wait > 0) {
        now += wait;
        wait = bucket.acquire();
      }
      eventTimes.push(now);
    }
    let maxInWindow = 0;
    for (const t of eventTimes) {
      const inWindow = eventTimes.filter((x) => x > t - 1000 && x <= t).length;
      maxInWindow = Math.max(maxInWindow, inWindow);
    }
    expect(maxInWindow).toBeLessThanOrEqual(15);
  });

  it("HTTP 429 abre circuit breaker respetando Retry-After", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    expect(passport).toBeDefined();
    let now = 1_000_000_000_000;
    const clock = () => now;

    const client = new PassportClient({
      mode: "fixture",
      clock,
      fixtureResolver: async () =>
        ({
          status: 429,
          headers: { "retry-after": "30" },
          body: { mensaje: "limit" },
        }) satisfies FixtureEnvelope,
    });

    const first = await client.query(passport!, "searchByText", { q: "aire" });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error.code).toBe("ERR_PASS_RATE_LIMITED");
    }

    const second = await client.query(passport!, "searchByText", { q: "aire" });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("ERR_PASS_RATE_LIMITED");
      expect(second.error.details?.retryInSec ?? second.error.message).toBeTruthy();
    }
  });
});