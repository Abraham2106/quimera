import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "packages/data-exodus/package.json"));
const postgres = require("postgres");

const migrations = [
  "packages/data-exodus/drizzle/0001_init_qum.sql",
  "packages/data-exodus/drizzle/0002_evidence_append_only.sql",
  "packages/fiscal-outbox/drizzle/0001_init_fob.sql",
  "apps/oficios/drizzle/0001_init_ofi.sql",
  "apps/oficios/drizzle/0002_diagnosis_materials.sql",
  "apps/oficios/drizzle/0003_ofi_rls.sql",
  "apps/oficios/drizzle/0004_saas_b2b_onboarding.sql",
];

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://quimera:quimera@127.0.0.1:5432/quimera";
const sql = postgres(databaseUrl, {
  max: 1,
  onnotice: () => {},
});

for (const relative of migrations) {
  const full = path.join(root, relative);
  const text = await readFile(full, "utf8");
  await sql.unsafe(text);
  process.stderr.write(`${JSON.stringify({ event: "db.migrate", file: relative })}\n`);
}

const extraDir = path.join(root, "drizzle");
try {
  const extra = (await readdir(extraDir)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of extra) {
    const text = await readFile(path.join(extraDir, name), "utf8");
    await sql.unsafe(text);
    process.stderr.write(`${JSON.stringify({ event: "db.migrate", file: `drizzle/${name}` })}\n`);
  }
} catch {
  // no extra drizzle directory
}

await sql.end({ timeout: 5 });
process.stdout.write(`${JSON.stringify({ ok: true, applied: migrations.length })}\n`);
