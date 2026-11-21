import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyFobMigration,
  createPostgresClient,
  dropFobObjects,
} from "@quimera/fiscal-outbox";
import type { Sql } from "postgres";

import { TENANT_SLUG_TO_UUID } from "../tenant-config.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages",
);

export const DEFAULT_DATABASE_URL =
  "postgres://quimera:quimera@127.0.0.1:5432/quimera";

async function dropQumObjects(client: Sql): Promise<void> {
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

export async function resetDemoPosDatabase(
  connectionString = DEFAULT_DATABASE_URL,
): Promise<Sql> {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = connectionString;
  const client = createPostgresClient(connectionString);
  await dropFobObjects(client);
  await dropQumObjects(client);

  const qumSql = await readFile(
    path.join(packageRoot, "data-exodus/drizzle/0001_init_qum.sql"),
    "utf8",
  );
  await client.unsafe(qumSql);

  const fobSql = await readFile(
    path.join(packageRoot, "fiscal-outbox/drizzle/0001_init_fob.sql"),
    "utf8",
  );
  await applyFobMigration(client, fobSql);

  for (const [slug, id] of Object.entries(TENANT_SLUG_TO_UUID)) {
    await client`
      INSERT INTO qum_tenants (id, slug, display_name)
      VALUES (${id}::uuid, ${slug}, ${slug})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  if (previous === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previous;
  }

  return client;
}