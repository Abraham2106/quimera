import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import { PassportClient } from "../../src/client/passport-client.js";
import type { FixtureEnvelope } from "../../src/client/fixtures.js";

const HEALTHY_CABYS = {
  total: 1,
  cantidad: 1,
  cabys: [{ codigo: "0000000000000", descripcion: "aire", impuesto: 0 }],
};

describe("T-PASS-008 — breaker 5xx, half-open y timeout de fetch", () => {
  it("5xx abre el breaker con el cooldown del manifest y recupera vía half-open", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    expect(passport).toBeDefined();
    const cooldownSec = passport!.rateLimit.quimeraGuardrail.circuitBreakerCooldownSec!;
    let now = 1_000_000_000_000;
    let status = 503;

    const client = new PassportClient({
      mode: "fixture",
      clock: () => now,
      fixtureResolver: async () => ({
        status,
        body: status === 200 ? HEALTHY_CABYS : { mensaje: "down" },
      }),
    });

    const first = await client.query(passport!, "searchByText", { q: "aire" });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error.code).toBe("ERR_PASS_UPSTREAM_UNAVAILABLE");
      expect(first.error.details?.circuitBreakerCooldownSec).toBe(cooldownSec);
    }

    const callsAfterFailure = client.getHttpCallCount();
    const blocked = await client.query(passport!, "searchByText", { q: "aire" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("ERR_PASS_RATE_LIMITED");
    }
    expect(client.getHttpCallCount()).toBe(callsAfterFailure);

    now += (cooldownSec + 1) * 1000;
    status = 200;
    const trial = await client.query(passport!, "searchByText", { q: "aire" });
    expect(trial.ok).toBe(true);
    if (trial.ok) {
      expect(trial.meta.fromCache).toBe(false);
    }
    expect(client.getHttpCallCount()).toBe(callsAfterFailure + 1);
  });

  it("un trial half-open en vuelo bloquea otras consultas y un fallo reabre", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    expect(passport).toBeDefined();
    const cooldownSec = passport!.rateLimit.quimeraGuardrail.circuitBreakerCooldownSec!;
    let now = 1_000_000_000_000;
    let gateActive = false;
    let release!: (fixture: FixtureEnvelope) => void;
    const gate = new Promise<FixtureEnvelope>((resolve) => {
      release = resolve;
    });

    const client = new PassportClient({
      mode: "fixture",
      clock: () => now,
      fixtureResolver: async () =>
        gateActive ? gate : { status: 503, body: { mensaje: "down" } },
    });

    const opening = await client.query(passport!, "searchByText", { q: "aire" });
    expect(opening.ok).toBe(false);

    now += (cooldownSec + 1) * 1000;
    gateActive = true;
    const trialPromise = client.query(passport!, "searchByText", { q: "aire" });

    const concurrent = await client.query(passport!, "searchByText", { q: "aire" });
    expect(concurrent.ok).toBe(false);
    if (!concurrent.ok) {
      expect(concurrent.error.details?.halfOpen).toBe(true);
    }

    release({ status: 503, body: { mensaje: "still down" } });
    const trial = await trialPromise;
    expect(trial.ok).toBe(false);

    const reopened = await client.query(passport!, "searchByText", { q: "aire" });
    expect(reopened.ok).toBe(false);
    if (!reopened.ok) {
      expect(reopened.error.code).toBe("ERR_PASS_RATE_LIMITED");
    }
  });

  it("el fetch en modo live recibe un AbortSignal.timeout", async () => {
    const passport = await getPassportById("cr.hacienda.cabys");
    expect(passport).toBeDefined();
    let receivedSignal: AbortSignal | undefined;

    const client = new PassportClient({
      mode: "live",
      fetchTimeoutMs: 5_000,
      fetch: async (_url, init) => {
        receivedSignal = init?.signal ?? undefined;
        return {
          status: 200,
          headers: new Headers(),
          bodyText: JSON.stringify(HEALTHY_CABYS),
        };
      },
    });

    const res = await client.query(passport!, "searchByText", { q: "aire" });
    expect(res.ok).toBe(true);
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(false);
  });
});
