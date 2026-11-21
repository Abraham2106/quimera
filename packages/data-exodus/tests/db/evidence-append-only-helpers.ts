import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Sql } from "postgres";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const EVIDENCE_TABLES = [
  "qum_artifacts",
  "qum_provenance_entries",
  "qum_decisions",
] as const;

export const EVIDENCE_APPEND_ONLY_SQL_PATH =
  "drizzle/0002_evidence_append_only.sql";

export async function readEvidenceAppendOnlySql(): Promise<string> {
  return readFile(path.join(packageRoot, EVIDENCE_APPEND_ONLY_SQL_PATH), "utf8");
}

export async function ensureEvidenceAppendOnlyMigration(client: Sql): Promise<void> {
  const rows = await client<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM pg_trigger
    WHERE tgname LIKE 'qum_append_only_%'
  `;
  if (Number(rows[0]?.count ?? "0") >= 3) return;
  const sql = await readEvidenceAppendOnlySql();
  await client.unsafe(sql);
}

export async function withEvidenceTablesUnlocked<T>(
  client: Sql,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  await ensureEvidenceAppendOnlyMigration(client);
  return client.begin(async (tx) => {
    for (const table of EVIDENCE_TABLES) {
      await tx.unsafe(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    }
    try {
      return await fn(tx);
    } finally {
      for (const table of EVIDENCE_TABLES) {
        await tx.unsafe(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
      }
    }
  });
}

export function isInsufficientPrivilegeError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? (error as { code: string }).code : "";
  if (code === "42501") return true;
  const message = "message" in error ? String((error as { message: string }).message) : "";
  return (
    message.includes("append-only") ||
    message.includes("permission denied for table qum_")
  );
}