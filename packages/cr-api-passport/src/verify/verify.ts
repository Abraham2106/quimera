import type { ApiPassport } from "../schema/api-passport.js";
import { validateAgainstJsonSchema, type SchemaValidationIssue } from "../schema/json-schema-validate.js";
import { PassportClient } from "../client/passport-client.js";
import { PASSPORT_ERROR_CODES, quimeraError } from "../errors.js";
import { normalizeMode, type PassportMode } from "../client/types.js";
import { loadFixture } from "../client/fixtures.js";
import { matchContractTest } from "../client/fixtures.js";

export type DriftReport = {
  readonly passportId: string;
  readonly status: "PASS" | "DRIFT_DETECTED" | "SKIPPED_MISSING_CREDENTIALS" | "ERROR";
  readonly tests: Array<{
    readonly id: string;
    readonly operation: string;
    readonly result: "PASS" | "DRIFT_DETECTED" | "SKIPPED" | "ERROR";
    readonly diff?: SchemaValidationIssue[];
    readonly message?: string;
  }>;
};

export type VerifyOptions = {
  readonly mode?: PassportMode | string;
  readonly env?: NodeJS.ProcessEnv;
  readonly client?: PassportClient;
};

export async function verifyPassport(
  passport: ApiPassport,
  options: VerifyOptions = {},
): Promise<DriftReport> {
  const mode = normalizeMode(options.mode ?? "fixture");
  const client =
    options.client ??
    new PassportClient({ mode, env: options.env ?? process.env });

  const auth = passport.auth;
  if (mode === "live" && auth.credentialsRequired) {
    const envVar = auth.envVar ?? "BCCR_SDDE_TOKEN";
    if (!(options.env ?? process.env)[envVar]) {
      return {
        passportId: passport.passportId,
        status: "SKIPPED_MISSING_CREDENTIALS",
        tests: passport.contractTests.map((t) => ({
          id: t.id,
          operation: t.operation,
          result: "SKIPPED" as const,
          message: `Missing ${envVar}`,
        })),
      };
    }
  }

  const tests: DriftReport["tests"] = [];

  for (const ct of passport.contractTests) {
    if (ct.expectLocalValidationError) {
      const err = await client.query(passport, ct.operation, stringifyParams(ct.params));
      if (!err.ok && err.error.code === ct.expectLocalValidationError) {
        tests.push({ id: ct.id, operation: ct.operation, result: "PASS" });
      } else {
        tests.push({
          id: ct.id,
          operation: ct.operation,
          result: "ERROR",
          message: `Expected local error ${ct.expectLocalValidationError}`,
        });
      }
      continue;
    }

    const params = stringifyParams(ct.params);
    let body: unknown;
    let status: number;

    if (ct.fixture) {
      const fx = await loadFixture(ct.fixture);
      status = fx.status;
      body = fx.body;
    } else {
      const res = await client.query(passport, ct.operation, params);
      if (!res.ok) {
        tests.push({
          id: ct.id,
          operation: ct.operation,
          result: "ERROR",
          message: res.error.message,
        });
        continue;
      }
      status = res.status;
      body = res.data;
    }

    const expectStatus = ct.expectStatus ?? 200;
    if (status !== expectStatus) {
      tests.push({
        id: ct.id,
        operation: ct.operation,
        result: "DRIFT_DETECTED",
        diff: [
          {
            path: "$.http.status",
            expected: String(expectStatus),
            observed: String(status),
          },
        ],
      });
      continue;
    }

    const op = passport.operations[ct.operation];
    const schema =
      op?.responses[String(expectStatus)] &&
      "schema" in op.responses[String(expectStatus)]!
        ? (op.responses[String(expectStatus)] as { schema: Record<string, unknown> }).schema
        : undefined;

    if (!schema) {
      tests.push({ id: ct.id, operation: ct.operation, result: "PASS" });
      continue;
    }

    const issues = validateAgainstJsonSchema(body, schema);
    if (issues.length > 0) {
      tests.push({
        id: ct.id,
        operation: ct.operation,
        result: "DRIFT_DETECTED",
        diff: issues,
      });
    } else {
      tests.push({ id: ct.id, operation: ct.operation, result: "PASS" });
    }
  }

  const status = tests.some((t) => t.result === "DRIFT_DETECTED")
    ? "DRIFT_DETECTED"
    : tests.every((t) => t.result === "PASS" || t.result === "SKIPPED")
      ? "PASS"
      : "ERROR";

  return { passportId: passport.passportId, status, tests };
}

export function driftToQuimeraError(report: DriftReport) {
  const drifted = report.tests.filter((t) => t.result === "DRIFT_DETECTED");
  return quimeraError(
    PASSPORT_ERROR_CODES.CONTRACT_DRIFT,
    "CONTRACT",
    `Contract drift detected in ${report.passportId}`,
    false,
    { passportId: report.passportId, diff: drifted },
  );
}

export async function verifyPassportWithFixtureFile(
  passport: ApiPassport,
  fixtureRelativePath: string,
  operation: string,
): Promise<SchemaValidationIssue[]> {
  const fx = await loadFixture(fixtureRelativePath);
  const op = passport.operations[operation];
  const schema =
    op?.responses["200"] && "schema" in op.responses["200"]
      ? (op.responses["200"] as { schema: Record<string, unknown> }).schema
      : undefined;
  if (!schema) {
    return [];
  }
  return validateAgainstJsonSchema(fx.body, schema);
}

function stringifyParams(
  params: Record<string, string | number> | undefined,
): Record<string, string> {
  if (!params) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = String(v);
  }
  return out;
}

export function resolveContractFixture(
  passport: ApiPassport,
  operation: string,
  params: Record<string, string>,
): string | undefined {
  return matchContractTest(passport, operation, params);
}