import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "packages/data-exodus/package.json"));
const postgres = require("postgres");

const MIGRATION_DIRS = [
  "packages/data-exodus/drizzle",
  "packages/fiscal-outbox/drizzle",
  "apps/oficios/drizzle",
];

export async function collectMigrationPaths(repoRoot = root) {
  const files = [];
  for (const relativeDir of MIGRATION_DIRS) {
    const dir = path.join(repoRoot, relativeDir);
    const names = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of names) {
      // Rutas relativas POSIX estables en todos los SO (la matriz CI incluye Windows).
      files.push(path.join(relativeDir, name).split(path.sep).join("/"));
    }
  }
  return files;
}

export async function assertApplicationRole(sql) {
  const rows = await sql`
    SELECT rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `;
  const role = rows[0];
  if (!role) {
    throw new Error("db.migrate: current PostgreSQL role not found");
  }
  if (role.rolsuper === true) {
    const err = new Error("db.migrate: SUPERUSER role is forbidden");
    err.code = "ERR_DB_ROLE_SUPERUSER";
    throw err;
  }
  if (role.rolbypassrls === true) {
    const err = new Error("db.migrate: BYPASSRLS role is forbidden");
    err.code = "ERR_DB_ROLE_BYPASSRLS";
    throw err;
  }
}

export async function runDbMigrate(options = {}) {
  const databaseUrl =
    options.databaseUrl ??
    process.env.DATABASE_URL ??
    "postgres://quimera:quimera@127.0.0.1:5432/quimera";
  const sql = postgres(databaseUrl, {
    max: 1,
    onnotice: () => {},
  });

  await assertApplicationRole(sql);

  const migrations = await collectMigrationPaths(options.repoRoot ?? root);
  for (const relative of migrations) {
    const full = path.join(options.repoRoot ?? root, relative);
    const text = await readFile(full, "utf8");
    await sql.unsafe(text);
    process.stderr.write(`${JSON.stringify({ event: "db.migrate", file: relative })}\n`);
  }

  await sql.end({ timeout: 5 });
  return { ok: true, applied: migrations.length };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const result = await runDbMigrate();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: err && typeof err === "object" && "code" in err ? err.code : undefined,
      })}\n`,
    );
    process.exit(1);
  }
}