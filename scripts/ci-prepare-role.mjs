import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../packages/data-exodus/package.json",
  ),
);
const postgres = require("postgres");

const adminUrl =
  process.env.CI_POSTGRES_ADMIN_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/postgres";

const sql = postgres(adminUrl, { max: 1 });

await sql.unsafe(`
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quimera') THEN
      CREATE ROLE quimera LOGIN PASSWORD 'quimera' NOSUPERUSER NOBYPASSRLS;
    ELSE
      ALTER ROLE quimera WITH LOGIN PASSWORD 'quimera' NOSUPERUSER NOBYPASSRLS;
    END IF;
  END
  $$;
`);

const databases = await sql`SELECT 1 FROM pg_database WHERE datname = 'quimera'`;
if (databases.length === 0) {
  await sql.unsafe("CREATE DATABASE quimera OWNER quimera");
} else {
  await sql.unsafe("ALTER DATABASE quimera OWNER TO quimera");
}

await sql.end({ timeout: 5 });
console.log("quimera role is NOSUPERUSER NOBYPASSRLS");
