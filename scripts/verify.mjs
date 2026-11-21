import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  OPENSPEC_TELEMETRY: "0",
  QUIMERA_AI_ENABLED: "false",
  QUIMERA_PASSPORT_MODE: "fixture",
};

// Default verification stays strictly offline and never uses live tokens or AI.
for (const key of ["BCCR_SDDE_TOKEN", "HACIENDA_USERNAME", "HACIENDA_PASSWORD", "HACIENDA_P12_PIN"]) {
  delete env[key];
}

const steps = [
  ["spec:validate"],
  ["typecheck"],
  ["lint"],
  ["test"],
  ["test:security"],
  ["test:isolation"],
  ["demo:verify"],
];

for (const args of steps) {
  execFileSync("pnpm", args, { cwd: root, env, stdio: "inherit" });
}
