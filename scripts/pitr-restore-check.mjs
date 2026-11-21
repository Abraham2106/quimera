import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(
  path.resolve(import.meta.dirname, "../packages/data-exodus/package.json"),
);
const postgres = require("postgres");

const TABLES = ["qum_artifacts", "qum_provenance_entries", "qum_decisions"];
const DRILL_SCHEMA = "pitr_drill";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://quimera:quimera@127.0.0.1:5432/quimera";

const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });

async function relaxRlsForDump() {
  for (const table of TABLES) {
    await sql.unsafe(`ALTER TABLE public.${table} NO FORCE ROW LEVEL SECURITY`);
  }
}

async function restoreRlsAfterDump() {
  for (const table of TABLES) {
    await sql.unsafe(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
  }
}

async function fingerprintTable(schema, table) {
  if (table === "qum_artifacts") {
    const rows = await sql.unsafe(
      `SELECT id::text AS id, sha256 FROM ${schema}.${table} ORDER BY id`,
    );
    const body = rows.map((row) => `${row.id}|${row.sha256}`).join("\n");
    return {
      rowCount: rows.length,
      payloadSha256: createHash("sha256").update(body, "utf8").digest("hex"),
    };
  }
  const rows = await sql.unsafe(`SELECT id::text AS id FROM ${schema}.${table} ORDER BY id`);
  const body = rows.map((row) => row.id).join("\n");
  return {
    rowCount: rows.length,
    payloadSha256: createHash("sha256").update(body, "utf8").digest("hex"),
  };
}

async function readFingerprints(schema) {
  const out = {};
  for (const table of TABLES) {
    out[table] = await fingerprintTable(schema, table);
  }
  return out;
}

async function setupDrillSchema() {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${DRILL_SCHEMA} CASCADE`);
  await sql.unsafe(`CREATE SCHEMA ${DRILL_SCHEMA}`);
  for (const table of TABLES) {
    await sql.unsafe(
      `CREATE TABLE ${DRILL_SCHEMA}.${table} (LIKE public.${table} INCLUDING DEFAULTS)`,
    );
  }
}

async function teardownDrillSchema() {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${DRILL_SCHEMA} CASCADE`);
}

function runPgDump() {
  const args = [
    databaseUrl,
    "--no-owner",
    "--no-privileges",
    "--data-only",
    "--inserts",
    ...TABLES.flatMap((table) => ["-t", table]),
  ];
  return execFileSync("pg_dump", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function sanitizePgDump(dump) {
  return dump
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("\\")) {
        return false;
      }
      // pg_dump 17+ emits this; the CI server is PostgreSQL 16.
      if (/transaction_timeout/i.test(trimmed)) {
        return false;
      }
      return true;
    })
    .join("\n");
}

function transformDumpForDrill(dump) {
  let text = sanitizePgDump(dump);
  for (const table of TABLES) {
    text = text.replaceAll(`INSERT INTO public.${table}`, `INSERT INTO ${DRILL_SCHEMA}.${table}`);
  }
  return text;
}

try {
  await relaxRlsForDump();
  const live = await readFingerprints("public");
  const dump = runPgDump();
  const dumpHash = createHash("sha256").update(dump, "utf8").digest("hex");

  await setupDrillSchema();
  const transformed = transformDumpForDrill(dump);
  if (transformed.trim().length > 0) {
    const dir = await mkdtemp(path.join(tmpdir(), "quimera-pitr-"));
    const dumpPath = path.join(dir, "restore.sql");
    await writeFile(dumpPath, transformed, "utf8");
    const source = new globalThis.URL(databaseUrl);
    execFileSync(
      "psql",
      [
        "-h",
        source.hostname,
        "-p",
        source.port || "5432",
        "-U",
        decodeURIComponent(source.username),
        "-d",
        source.pathname.replace(/^\//, ""),
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        dumpPath,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PGPASSWORD: decodeURIComponent(source.password) },
      },
    );
    await rm(dir, { recursive: true, force: true });
  }
  const restored = await readFingerprints(DRILL_SCHEMA);

  const mismatches = [];
  for (const table of TABLES) {
    const a = live[table];
    const b = restored[table];
    if (a.rowCount !== b.rowCount || a.payloadSha256 !== b.payloadSha256) {
      mismatches.push({ table, live: a, restored: b });
    }
  }

  if (mismatches.length > 0) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, event: "pitr.restore_check", mismatches, dumpSha256: dumpHash })}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        event: "pitr.restore_check",
        tables: TABLES,
        dumpSha256: dumpHash,
      })}\n`,
    );
  }
} finally {
  try {
    await restoreRlsAfterDump();
  } catch {
    // best effort
  }
  try {
    await teardownDrillSchema();
  } catch {
    // best effort
  }
  await sql.end({ timeout: 5 });
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}