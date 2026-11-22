import type { ApiPassport } from "../schema/api-passport.js";
import {
  validateAgainstJsonSchema,
  type SchemaValidationIssue,
} from "../schema/json-schema-validate.js";
import { PASSPORT_ERROR_CODES, quimeraError } from "../errors.js";
import { HostTokenBucket } from "./token-bucket.js";
import { HostCircuitBreaker } from "./circuit-breaker.js";
import { TtlCache, cacheKey } from "./cache.js";
import { validateOperationParams } from "./param-validation.js";
import {
  FIXTURE_FALLBACK,
  loadFixture,
  matchContractTest,
  type FixtureEnvelope,
} from "./fixtures.js";
import type { FetchFn, PassportMode, QueryResult } from "./types.js";
import { normalizeMode } from "./types.js";

const REDACT_FIELD_PATTERN = /identificacion|cédula|cedula|nombre|token|authorization/i;
const DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SEC = 60;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

function redactForLog(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (REDACT_FIELD_PATTERN.test(text)) {
    return "[REDACTED]";
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function buildUrl(passport: ApiPassport, operationName: string, params: Record<string, string>): string {
  const op = passport.operations[operationName];
  if (!op) {
    throw new Error(`missing operation ${operationName}`);
  }
  const url = new URL(op.path, passport.baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

function parseRetryAfter(headers: Headers | Record<string, string>): number {
  const raw =
    headers instanceof Headers ? headers.get("retry-after") : headers["retry-after"];
  if (!raw) {
    return 60;
  }
  const seconds = Number(raw);
  if (!Number.isNaN(seconds)) {
    return Math.max(1, seconds);
  }
  return 60;
}

function responseIssues(
  passport: ApiPassport,
  operationName: string,
  body: unknown,
): SchemaValidationIssue[] {
  const responseSchema = passport.operations[operationName]?.responses["200"];
  if (responseSchema && "schema" in responseSchema && responseSchema.schema) {
    return validateAgainstJsonSchema(body, responseSchema.schema);
  }
  return [];
}

export type PassportClientOptions = {
  readonly mode?: PassportMode | string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: FetchFn;
  readonly clock?: () => number;
  readonly fetchTimeoutMs?: number;
  readonly fixtureResolver?: (passportId: string, operation: string, params: Record<string, string>) => Promise<FixtureEnvelope>;
};

export class PassportClient {
  private readonly mode: PassportMode;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchFn: FetchFn;
  private readonly clock: () => number;
  private readonly buckets = new Map<string, HostTokenBucket>();
  private readonly breakers = new Map<string, HostCircuitBreaker>();
  private readonly cache: TtlCache<{ data: unknown; status: number }>;
  private readonly fixtureResolver: PassportClientOptions["fixtureResolver"];
  private readonly fetchTimeoutMs: number;
  private httpCallCount = 0;

  constructor(options: PassportClientOptions = {}) {
    this.mode = normalizeMode(options.mode ?? process.env.QUIMERA_PASSPORT_MODE);
    this.env = options.env ?? process.env;
    this.clock = options.clock ?? (() => Date.now());
    this.cache = new TtlCache(this.clock);
    this.fixtureResolver = options.fixtureResolver;
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.fetchFn =
      options.fetch ??
      (async (url, init) => {
        const res = await fetch(url, init);
        const bodyText = await res.text();
        return { status: res.status, headers: res.headers, bodyText };
      });
  }

  getHttpCallCount(): number {
    return this.httpCallCount;
  }

  resetHttpCallCount(): void {
    this.httpCallCount = 0;
  }

  private bucketFor(host: string, passport: ApiPassport): HostTokenBucket {
    let b = this.buckets.get(host);
    if (!b) {
      const g = passport.rateLimit.quimeraGuardrail;
      const official = passport.rateLimit.officialPolicy;
      b = new HostTokenBucket({
        burstPerSec: g.burstRequestsPerSec,
        sustainedPerSec: g.sustainedRequestsPerSec,
        sustainedWindowSec: official.sustainedWindowSec,
        clock: this.clock,
      });
      this.buckets.set(host, b);
    }
    return b;
  }

  private breakerFor(host: string): HostCircuitBreaker {
    let b = this.breakers.get(host);
    if (!b) {
      b = new HostCircuitBreaker(this.clock);
      this.breakers.set(host, b);
    }
    return b;
  }

  private checkAuth(passport: ApiPassport): ReturnType<typeof quimeraError> | null {
    if (!passport.auth.credentialsRequired) {
      return null;
    }
    const envVar = passport.auth.envVar ?? "BCCR_SDDE_TOKEN";
    const token = this.env[envVar];
    if (!token) {
      return quimeraError(
        PASSPORT_ERROR_CODES.AUTH_MISSING,
        "SECURITY",
        passport.auth.instructions ??
          `Missing credentials: set environment variable ${envVar}`,
        false,
        { envVar, passportId: passport.passportId },
      );
    }
    return null;
  }

  async query(
    passport: ApiPassport,
    operationName: string,
    params: Record<string, string>,
  ): Promise<QueryResult> {
    if (passport.executable === false) {
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.INVALID_INPUT,
          "VALIDATION",
          `Passport ${passport.passportId} is informational only`,
          false,
        ),
      };
    }

    const localErr = validateOperationParams(passport, operationName, params);
    if (localErr) {
      return { ok: false, error: localErr };
    }

    const authErr = this.checkAuth(passport);
    if (authErr) {
      return { ok: false, error: authErr };
    }

    const key = cacheKey({
      passportId: passport.passportId,
      passportVersion: passport.passportVersion,
      operation: operationName,
      params,
    });
    const cached = this.cache.get(key);
    if (cached) {
      const issues = responseIssues(passport, operationName, cached.value.data);
      if (issues.length > 0) {
        this.cache.delete(key);
        return {
          ok: false,
          error: quimeraError(
            PASSPORT_ERROR_CODES.CONTRACT_DRIFT,
            "CONTRACT",
            "Cached response does not match passport contract",
            false,
            { drift: issues, fromCache: true },
          ),
        };
      }
      return {
        ok: true,
        data: cached.value.data,
        status: cached.value.status,
        meta: {
          fetchedAt: new Date(cached.storedAtMs).toISOString(),
          fromCache: true,
          stale: false,
          passportVersion: passport.passportVersion,
          httpCalls: 0,
          untrustedExternalData: true,
        },
      };
    }

    const host = passport.rateLimit.scopeHost;
    const breaker = this.breakerFor(host);
    const cooldownSec =
      passport.rateLimit.quimeraGuardrail.circuitBreakerCooldownSec ??
      DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SEC;
    if (breaker.isOpen()) {
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.RATE_LIMITED,
          "EXTERNAL_API",
          `Circuit breaker open for ${host}; retry in ${breaker.secondsRemaining()}s`,
          true,
          { host, retryInSec: breaker.secondsRemaining() },
        ),
      };
    }
    const wasHalfOpen = breaker.isHalfOpen();
    if (wasHalfOpen && !breaker.tryHalfOpen()) {
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.RATE_LIMITED,
          "EXTERNAL_API",
          `Circuit breaker half-open trial already in flight for ${host}`,
          true,
          { host, halfOpen: true },
        ),
      };
    }

    const bucket = this.bucketFor(host, passport);
    const waitMs = bucket.acquire();
    if (waitMs > 0) {
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.RATE_LIMITED,
          "EXTERNAL_API",
          "Rate limit exceeded",
          true,
          { retryAfterMs: waitMs },
        ),
      };
    }

    const op = passport.operations[operationName]!;
    let status: number;
    let body: unknown;
    let headerMap: Headers | Record<string, string> = {};

    if (this.mode === "fixture" || this.mode === "mock") {
      const fixture = await this.resolveFixture(passport, operationName, params);
      status = fixture.status;
      headerMap = fixture.headers ?? {};
      body = fixture.body;
      this.httpCallCount += 1;
    } else {
      const url = buildUrl(passport, operationName, params);
      const headers: Record<string, string> = { Accept: "application/json" };
      if (passport.auth.type === "bearer" && passport.auth.envVar) {
        const token = this.env[passport.auth.envVar]!;
        headers.Authorization = `Bearer ${token}`;
      }
      try {
        const res = await this.fetchFn(url, {
          method: op.method,
          headers,
          signal: AbortSignal.timeout(this.fetchTimeoutMs),
        });
        this.httpCallCount += 1;
        status = res.status;
        headerMap = res.headers;
        if (res.bodyText) {
          try {
            body = JSON.parse(res.bodyText) as unknown;
          } catch {
            body = res.bodyText;
          }
        } else {
          body = null;
        }
      } catch {
        breaker.recordFailure(cooldownSec);
        return {
          ok: false,
          error: quimeraError(
            PASSPORT_ERROR_CODES.UPSTREAM_UNAVAILABLE,
            "EXTERNAL_API",
            "Upstream request failed",
            true,
            { circuitBreakerCooldownSec: cooldownSec, retryInSec: breaker.secondsRemaining() },
          ),
        };
      }
    }

    if (status === 400) {
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.INVALID_INPUT,
          "VALIDATION",
          "Upstream rejected input",
          false,
          { status },
        ),
      };
    }
    if (status === 404) {
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.NOT_FOUND,
          "EXTERNAL_API",
          "Resource not found",
          false,
          { status },
        ),
      };
    }
    if (status === 429) {
      const retry = parseRetryAfter(headerMap);
      breaker.openForSeconds(retry);
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.RATE_LIMITED,
          "EXTERNAL_API",
          `Rate limited by upstream; retry after ${retry}s`,
          true,
          { retryAfterSec: retry },
        ),
      };
    }
    if (status >= 500) {
      breaker.recordFailure(cooldownSec);
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.UPSTREAM_UNAVAILABLE,
          "EXTERNAL_API",
          `Upstream unavailable (HTTP ${status})`,
          true,
          { status, circuitBreakerCooldownSec: cooldownSec, retryInSec: breaker.secondsRemaining() },
        ),
      };
    }
    breaker.recordSuccess();

    if (status !== 200) {
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.UPSTREAM_UNAVAILABLE,
          "EXTERNAL_API",
          `Unexpected HTTP ${status}`,
          false,
          { status },
        ),
      };
    }

    const issues = responseIssues(passport, operationName, body);
    if (issues.length > 0) {
      return {
        ok: false,
        error: quimeraError(
          PASSPORT_ERROR_CODES.CONTRACT_DRIFT,
          "CONTRACT",
          "Response does not match passport contract",
          false,
          { drift: issues },
        ),
      };
    }

    void redactForLog(body);

    const now = this.clock();
    this.cache.set(key, { data: body, status }, passport.cache.defaultTtlSec);

    return {
      ok: true,
      data: body,
      status,
      meta: {
        fetchedAt: new Date(now).toISOString(),
        fromCache: false,
        stale: false,
        passportVersion: passport.passportVersion,
        httpCalls: 1,
        untrustedExternalData: true,
      },
    };
  }

  private async resolveFixture(
    passport: ApiPassport,
    operation: string,
    params: Record<string, string>,
  ): Promise<FixtureEnvelope> {
    if (this.fixtureResolver) {
      return this.fixtureResolver(passport.passportId, operation, params);
    }
    const matched = matchContractTest(passport, operation, params);
    const rel =
      matched ??
      FIXTURE_FALLBACK[passport.passportId]?.[operation] ??
      "generic-200.json";
    return loadFixture(rel);
  }
}