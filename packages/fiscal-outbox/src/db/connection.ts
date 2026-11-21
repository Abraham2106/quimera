import postgres, { type Sql, type TransactionSql } from "postgres";

import { FiscalOutboxDbError } from "./errors.js";

export type FobSql = Sql | TransactionSql;

const TENANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertFobTenantId(tenantId: string): void {
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new FiscalOutboxDbError(
      "ERR_DB_TENANT_CONTEXT",
      `Invalid tenant_id UUID: ${tenantId}`,
    );
  }
}

function isRootSql(client: FobSql): client is Sql {
  return "begin" in client && typeof client.begin === "function";
}

/** Establece `app.current_tenant_id` (SET LOCAL) al inicio de la transacción. */
export async function withFobTenantTransaction<T>(
  client: FobSql,
  tenantId: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  assertFobTenantId(tenantId);
  if (!isRootSql(client)) {
    await client`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(client);
  }
  return client.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

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