import type { Sql } from "postgres";

import { FiscalOutboxDbError } from "./errors.js";

export const INIT_FOB_MIGRATION_SQL_PATH = "drizzle/0001_init_fob.sql";

export async function applyFobMigration(client: Sql, sql: string): Promise<void> {
  try {
    await client.unsafe(sql);
  } catch (cause) {
    throw new FiscalOutboxDbError(
      "ERR_DB_MIGRATION",
      "Failed applying 0001_init_fob.sql",
      { cause },
    );
  }
}

export async function dropFobObjects(client: Sql): Promise<void> {
  const tables = [
    "fob_fiscal_documents",
    "fob_fiscal_intents",
    "fob_fiscal_sequences",
  ];
  for (const table of tables) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}