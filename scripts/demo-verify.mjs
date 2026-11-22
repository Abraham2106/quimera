import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  OPENSPEC_TELEMETRY: "0",
  QUIMERA_AI_ENABLED: "false",
  QUIMERA_PASSPORT_MODE: "fixture",
  NODE_ENV: process.env.NODE_ENV ?? "test",
  OFICIOS_AUTH_MODE: process.env.OFICIOS_AUTH_MODE ?? "test-headers",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgres://quimera:quimera@127.0.0.1:5432/quimera",
};

// Same credential strip as `verify.mjs`: demo runs stay offline and never
// inherit live BCCR/Hacienda secrets from the surrounding shell.
for (const key of ["BCCR_SDDE_TOKEN", "HACIENDA_USERNAME", "HACIENDA_PASSWORD", "HACIENDA_P12_PIN"]) {
  delete env[key];
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    console.error(`demo:verify failed: ${command} ${args.join(" ")} -> ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const anomalies = JSON.parse(
  await readFile(path.join(root, "fixtures/demo-hvac-1000/ANOMALIES.json"), "utf8"),
);
const counts = anomalies.counts;
const expected = {
  duplicate_client_groups: 40,
  duplicate_invoices: 12,
  misattributed_payments: 7,
  conflicting_identity_pairs: 3,
  unreconcilable_balances: 1,
};
for (const [key, value] of Object.entries(expected)) {
  if (counts[key] !== value) {
    console.error(`ANOMALIES.json ${key}=${counts[key]} expected ${value}`);
    process.exit(1);
  }
}
console.log("demo-hvac-1000 anomaly manifest: 40/12/7/3/1");

run("pnpm", [
  "--filter",
  "@quimera/data-exodus",
  "exec",
  "vitest",
  "run",
  "tests/demo-hvac/load-fixture.test.ts",
  "tests/demo-hvac/migrate-from-files.integration.test.ts",
  "--fileParallelism=false",
]);
run("pnpm", [
  "--filter",
  "@quimera/pipeline",
  "exec",
  "vitest",
  "run",
  "src/t-pipe.test.ts",
  "src/t-pipe-hvac-gate.test.ts",
  "--fileParallelism=false",
]);
run("pnpm", [
  "--filter",
  "@quimera/demo-pos",
  "exec",
  "vitest",
  "run",
  "--fileParallelism=false",
]);
run("pnpm", [
  "--filter",
  "@quimera/oficios",
  "exec",
  "vitest",
  "run",
  "tests/api/at-15-api-transition.test.ts",
  "tests/api/t-ofi-close-idempotent.test.ts",
]);
run("pnpm", [
  "--filter",
  "@quimera/factura-ci",
  "exec",
  "vitest",
  "run",
  "src/t-fci-002-fc-017-concurrency.test.ts",
  "src/t-fci-003-fc-031-tcp-cut.test.ts",
  "src/t-fci-008-cli-report.test.ts",
]);

console.log("demo:verify ok (QUIMERA_AI_ENABLED=false)");
