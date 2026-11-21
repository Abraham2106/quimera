import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import postgres from "postgres";

import { QuimeraDbError } from "./errors.js";
import { qumSchema } from "./schema/index.js";

const TENANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type QuimeraDb = PostgresJsDatabase<typeof qumSchema>;

function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return env?.[name];
}

export function resolveDatabaseUrl(): string {
  const url = readEnv("DATABASE_URL");
  if (!url) {
    throw new QuimeraDbError(
      "ERR_DB_CONFIG",
      "DATABASE_URL must be set for PostgreSQL access",
    );
  }
  return url;
}

export function createPostgresClient(connectionString = resolveDatabaseUrl()): Sql {
  return postgres(connectionString, {
    max: 10,
    // Simple query protocol: permite scripts multi-sentencia (0001_init_qum.sql).
    prepare: false,
  });
}

export function createDb(client: Sql): QuimeraDb {
  return drizzle(client, { schema: qumSchema });
}

export function assertTenantId(tenantId: string): void {
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new QuimeraDbError(
      "ERR_DB_TENANT_CONTEXT",
      `Invalid tenant_id UUID: ${tenantId}`,
    );
  }
}

/** Establece `app.current_tenant_id` en la transacción (SET LOCAL) y ejecuta el callback. */
export async function withTenantTransaction<T>(
  client: Sql,
  tenantId: string,
  fn: (db: QuimeraDb) => Promise<T>,
): Promise<T> {
  assertTenantId(tenantId);
  const db = createDb(client);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}