import type { QuimeraError } from "@quimera/core";

export type PassportMode = "fixture" | "mock" | "live";

export function normalizeMode(mode: string | undefined): PassportMode {
  if (mode === "live") {
    return "live";
  }
  if (mode === "mock") {
    return "fixture";
  }
  return "fixture";
}

export type FetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<{ status: number; headers: Headers; bodyText: string }>;

export type QueryMeta = {
  readonly fetchedAt: string;
  readonly fromCache: boolean;
  readonly stale: boolean;
  readonly passportVersion: string;
  readonly httpCalls: number;
  readonly untrustedExternalData: boolean;
};

export type QuerySuccess = {
  readonly ok: true;
  readonly data: unknown;
  readonly status: number;
  readonly meta: QueryMeta;
};

export type QueryFailure = {
  readonly ok: false;
  readonly error: QuimeraError;
  readonly meta?: Partial<QueryMeta>;
};

export type QueryResult = QuerySuccess | QueryFailure;