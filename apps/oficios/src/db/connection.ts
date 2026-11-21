import type { Sql, TransactionSql } from "postgres";
import postgres from "postgres";

export type OficiosSql = Sql | TransactionSql;

const LOCAL_DATABASE_URL = "postgres://quimera:quimera@127.0.0.1:5432/quimera";

const TENANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createOficiosPostgresClient(
  databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
): postgres.Sql {
  return postgres(databaseUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export function assertOficiosTenantId(tenantId: string): void {
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new Error(`ERR_DB_TENANT_CONTEXT: Invalid tenant_id UUID: ${tenantId}`);
  }
}

/**
 * Establece `app.current_tenant_id` (SET LOCAL) al inicio de la transacción y ejecuta el callback.
 * Obligatorio antes de leer o escribir tablas `ofi_*` bajo FORCE RLS.
 */
export async function withOfiTenantTransaction<T>(
  client: Sql,
  tenantId: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  assertOficiosTenantId(tenantId);
  const result = await client.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
  return result as T;
}