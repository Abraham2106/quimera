import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const hasPgDump = spawnSync("pg_dump", ["--version"], { encoding: "utf8" }).status === 0;

// En entornos sin el cliente de PostgreSQL (p. ej. Windows local) no se puede
// ejecutar el restore check; CI con PostgreSQL sí lo corre.
const describeWithPgDump = hasPgDump ? describe : describe.skip;

describeWithPgDump("pitr-restore-check.mjs", () => {
  it("termina con exit 0 comparando conteos y huellas sha256", () => {
    const env = {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://quimera:quimera@127.0.0.1:5432/quimera",
    };
    const out = execFileSync("node", ["scripts/pitr-restore-check.mjs"], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
    });
    const payload = JSON.parse(out.trim());
    expect(payload.ok).toBe(true);
    expect(payload.event).toBe("pitr.restore_check");
  });
});