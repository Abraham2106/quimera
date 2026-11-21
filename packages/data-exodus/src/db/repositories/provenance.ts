import { and, eq } from "drizzle-orm";

import type { QuimeraDb } from "../connection.js";
import { QuimeraDbError } from "../errors.js";
import { qumProvenanceEntries } from "../schema/index.js";

export type NewProvenanceEntry = typeof qumProvenanceEntries.$inferInsert;
export type ProvenanceEntry = typeof qumProvenanceEntries.$inferSelect;

export function createProvenanceRepository(db: QuimeraDb) {
  return {
    async insert(entry: NewProvenanceEntry): Promise<ProvenanceEntry> {
      const rows = await db
        .insert(qumProvenanceEntries)
        .values(entry)
        .returning();
      const row = rows[0];
      if (!row) {
        throw new QuimeraDbError("ERR_DB_QUERY", "insert returned no row");
      }
      return row;
    },

    async listByEntity(
      tenantId: string,
      entityId: string,
    ): Promise<ProvenanceEntry[]> {
      return db
        .select()
        .from(qumProvenanceEntries)
        .where(
          and(
            eq(qumProvenanceEntries.tenantId, tenantId),
            eq(qumProvenanceEntries.entityId, entityId),
          ),
        );
    },

    async listByArtifact(
      tenantId: string,
      artifactId: string,
    ): Promise<ProvenanceEntry[]> {
      return db
        .select()
        .from(qumProvenanceEntries)
        .where(
          and(
            eq(qumProvenanceEntries.tenantId, tenantId),
            eq(qumProvenanceEntries.artifactId, artifactId),
          ),
        );
    },
  };
}

export type ProvenanceRepository = ReturnType<typeof createProvenanceRepository>;