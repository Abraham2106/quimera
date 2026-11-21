import { and, eq } from "drizzle-orm";

import type { QuimeraDb } from "../connection.js";
import { QuimeraDbError } from "../errors.js";
import { qumDecisions } from "../schema/index.js";

export type NewDecision = typeof qumDecisions.$inferInsert;
export type Decision = typeof qumDecisions.$inferSelect;

export function createDecisionsRepository(db: QuimeraDb) {
  return {
    async insert(decision: NewDecision): Promise<Decision> {
      const rows = await db.insert(qumDecisions).values(decision).returning();
      const row = rows[0];
      if (!row) {
        throw new QuimeraDbError("ERR_DB_QUERY", "insert returned no row");
      }
      return row;
    },

    async getById(tenantId: string, id: string): Promise<Decision | undefined> {
      const rows = await db
        .select()
        .from(qumDecisions)
        .where(and(eq(qumDecisions.tenantId, tenantId), eq(qumDecisions.id, id)))
        .limit(1);
      return rows[0];
    },

    async listByConflict(
      tenantId: string,
      conflictId: string,
    ): Promise<Decision[]> {
      return db
        .select()
        .from(qumDecisions)
        .where(
          and(
            eq(qumDecisions.tenantId, tenantId),
            eq(qumDecisions.conflictId, conflictId),
          ),
        );
    },
  };
}

export type DecisionsRepository = ReturnType<typeof createDecisionsRepository>;