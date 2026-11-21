import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("db-migrate.mjs", () => {
  it("ordena migraciones qum, fob, ofi y saas por prefijo numérico", async () => {
    const { collectMigrationPaths } = await import("../../../../scripts/db-migrate.mjs");
    const files = await collectMigrationPaths(repoRoot);
    expect(files[0]).toBe("packages/data-exodus/drizzle/0001_init_qum.sql");
    expect(files).toContain("packages/fiscal-outbox/drizzle/0003_fob_fiscal_credentials.sql");
    expect(files).toContain("apps/oficios/drizzle/0007_saas_audit.sql");
    const fobStart = files.findIndex((f) => f.includes("fiscal-outbox"));
    const ofiStart = files.findIndex((f) => f.includes("apps/oficios"));
    expect(fobStart).toBeGreaterThan(0);
    expect(ofiStart).toBeGreaterThan(fobStart);
  });

  it("aplica migraciones con rol quimera cuando DATABASE_URL responde", () => {
    const databaseUrl =
      process.env.DATABASE_URL ?? "postgres://quimera:quimera@127.0.0.1:5432/quimera";
    try {
      const out = execFileSync("node", ["scripts/db-migrate.mjs"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: "utf8",
      });
      const payload = JSON.parse(out.trim());
      expect(payload.ok).toBe(true);
      expect(payload.applied).toBeGreaterThanOrEqual(12);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ECONNREFUSED") || message.includes("password authentication")) {
        return;
      }
      throw err;
    }
  });

  it("rechaza rol superusuario", async () => {
    const adminUrl =
      process.env.CI_POSTGRES_ADMIN_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
    const { assertApplicationRole } = await import("../../../../scripts/db-migrate.mjs");
    const { createRequire } = await import("node:module");
    const require = createRequire(
      path.join(repoRoot, "packages/data-exodus/package.json"),
    );
    const postgres = require("postgres") as typeof import("postgres");
    const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
    try {
      await assertApplicationRole(sql);
      expect.fail("expected SUPERUSER role to be rejected");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("ECONNREFUSED") ||
        message.includes("password authentication") ||
        message.includes("does not exist")
      ) {
        return;
      }
      expect(message).toMatch(/SUPERUSER|forbidden/i);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});