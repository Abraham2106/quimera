import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ApiPassport } from "../schema/api-passport.js";
import { fixturesDir } from "../paths.js";

export type FixtureEnvelope = {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body: unknown;
};

export async function loadFixture(relativePath: string): Promise<FixtureEnvelope> {
  const filePath = path.join(fixturesDir(), relativePath);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as FixtureEnvelope;
}

export function matchContractTest(
  passport: ApiPassport,
  operation: string,
  params: Record<string, string>,
): string | undefined {
  for (const test of passport.contractTests) {
    if (test.operation !== operation || !test.fixture) {
      continue;
    }
    const tp = test.params ?? {};
    const keys = Object.keys(tp);
    if (keys.length === 0) {
      return test.fixture;
    }
    const allMatch = keys.every((k) => String(tp[k]) === params[k]);
    if (allMatch) {
      return test.fixture;
    }
  }
  return undefined;
}

export const FIXTURE_FALLBACK: Record<string, Record<string, string>> = {
  "cr.hacienda.taxpayer": { lookupByIdentification: "taxpayer-200.json" },
  "cr.hacienda.cabys": { searchByText: "cabys-search-refrigeracion.json" },
  "cr.hacienda.fx": { getDollarRate: "fx-dolar-200.json" },
  "cr.bccr.sdde": { getEconomicSeries: "bccr-series-200.json" },
};