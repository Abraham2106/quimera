import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  OPENSPEC_TELEMETRY: "0",
  QUIMERA_AI_ENABLED: "false",
  QUIMERA_PASSPORT_MODE: "fixture",
  NODE_ENV: process.env.NODE_ENV ?? "test",
  OFICIOS_AUTH_MODE: process.env.OFICIOS_AUTH_MODE ?? "test-headers",
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://quimera:quimera@127.0.0.1:5432/quimera",
  CI_POSTGRES_ADMIN_URL:
    process.env.CI_POSTGRES_ADMIN_URL ??
    "postgres://postgres:postgres@127.0.0.1:5432/postgres",
};

// Default verification stays strictly offline and never uses live tokens or AI.
for (const key of ["BCCR_SDDE_TOKEN", "HACIENDA_USERNAME", "HACIENDA_PASSWORD", "HACIENDA_P12_PIN"]) {
  delete env[key];
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, env, stdio: "inherit" });
}

// Prepare the same non-superuser role and schema that CI uses before any test
// touches PostgreSQL; installs are frozen so the lockfile is part of the gate.
run("pnpm", ["install", "--frozen-lockfile"]);
run("node", ["scripts/ci-prepare-role.mjs"]);
run("pnpm", ["db:migrate"]);

const steps = [
  ["spec:validate"],
  ["typecheck"],
  ["lint"],
  ["test"],
  ["test:security"],
  ["test:isolation"],
  ["demo:verify"],
  ["audit", "--audit-level=high"],
];

for (const args of steps) {
  run("pnpm", args);
}

const gitleaksOptions = {
  cwd: root,
  env,
  stdio: "ignore",
  shell: process.platform === "win32",
};
const detected = spawnSync("gitleaks", ["version"], gitleaksOptions);
if (detected.status === 0) {
  const scan = spawnSync(
    "gitleaks",
    ["detect", "--no-banner", "--redact", "--source", "."],
    { ...gitleaksOptions, stdio: "inherit" },
  );
  if (scan.status !== 0) {
    throw new Error(`verify: gitleaks detect falló (${scan.status ?? "señal"})`);
  }
} else {
  console.log("verify: gitleaks no disponible; se omite el escaneo local de secretos");
}
