import { spawnSync } from "node:child_process";

if (process.env.HACIENDA_SANDBOX_E2E !== "1") {
  process.stdout.write(
    `${JSON.stringify({ ok: true, skipped: true, reason: "HACIENDA_SANDBOX_E2E is not 1" })}\n`,
  );
  process.exit(0);
}

const result = spawnSync("pnpm", ["--filter", "@quimera/factura-ci", "test"], {
  stdio: "inherit",
  env: { ...process.env, QUIMERA_AI_ENABLED: "false" },
});
process.exit(result.status ?? 1);
