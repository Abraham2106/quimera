import postgres, { type Sql } from "postgres";

import { FiscalOutboxDbError } from "./errors.js";

function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return env?.[name];
}

export function resolveDatabaseUrl(): string {
  const url = readEnv("DATABASE_URL");
  if (!url) {
    throw new FiscalOutboxDbError(
      "ERR_DB_CONFIG",
      "DATABASE_URL must be set for PostgreSQL access",
    );
  }
  return url;
}

export function createPostgresClient(connectionString = resolveDatabaseUrl()): Sql {
  return postgres(connectionString, {
    max: 20,
    prepare: false,
  });
}