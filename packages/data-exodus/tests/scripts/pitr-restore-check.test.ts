import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("pitr-restore-check.mjs", () => {
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