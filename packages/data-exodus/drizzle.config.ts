import { defineConfig } from "drizzle-kit";

/**
 * Generar o inspeccionar migraciones (sin editar package.json):
 *   cd packages/data-exodus && DATABASE_URL=postgres://quimera:quimera@127.0.0.1:5432/quimera npx drizzle-kit generate
 * Aplicar SQL versionado manualmente:
 *   psql "$DATABASE_URL" -f drizzle/0001_init_qum.sql
 */
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://quimera:quimera@127.0.0.1:5432/quimera",
  },
  migrations: {
    prefix: "000",
  },
});