import type { Sql } from "postgres";

import { QuimeraDbError } from "./errors.js";

/** Ruta relativa al paquete (aplicar con psql -f). */
export const INIT_MIGRATION_SQL_PATH = "drizzle/0001_init_qum.sql";

export async function applyInitMigration(client: Sql, sql: string): Promise<void> {
  try {
    await client.unsafe(sql);
  } catch (cause) {
    throw new QuimeraDbError(
      "ERR_DB_MIGRATION",
      "Failed applying 0001_init_qum.sql",
      { cause },
    );
  }
}

/** Elimina únicamente objetos qum_* (pruebas locales / re-aplicación controlada). */
export async function dropQumObjects(client: Sql): Promise<void> {
  const tables = [
    "qum_checkpoints",
    "qum_execution_runs",
    "qum_provenance_entries",
    "qum_entity_relations",
    "qum_decisions",
    "qum_conflicts",
    "qum_entities",
    "qum_raw_records",
    "qum_import_batches",
    "qum_artifacts",
    "qum_data_sources",
    "qum_schema_versions",
    "qum_tenants",
  ];
  for (const table of tables) {
    await client.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}