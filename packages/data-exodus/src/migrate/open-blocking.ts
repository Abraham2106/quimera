import { and, eq } from "drizzle-orm";
import type { Sql } from "postgres";

import { withTenantTransaction } from "../db/connection.js";
import { qumConflicts } from "../db/schema/index.js";

export async function listOpenBlockingConflictIds(
  client: Sql,
  tenantId: string,
): Promise<string[]> {
  return withTenantTransaction(client, tenantId, async (db) => {
    const rows = await db
      .select({ id: qumConflicts.id })
      .from(qumConflicts)
      .where(
        and(
          eq(qumConflicts.tenantId, tenantId),
          eq(qumConflicts.severity, "BLOCKING"),
          eq(qumConflicts.status, "OPEN"),
        ),
      );
    return rows.map((r) => r.id);
  });
}