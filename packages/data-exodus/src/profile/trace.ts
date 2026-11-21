import { and, eq } from "drizzle-orm";
import type { Sql } from "postgres";

import { withTenantTransaction } from "../db/connection.js";
import {
  qumArtifacts,
  qumDecisions,
  qumEntities,
  qumProvenanceEntries,
} from "../db/schema/index.js";
import { DataExodusError } from "../decisions/errors.js";

export type TraceDecisionRef = {
  decisionId: string;
  actorId: string;
  action: string;
  rationale: string;
  decidedAt: Date;
};

export type TraceProvenanceNode = {
  provenanceEntryId: string;
  fieldPath: string;
  artifact: {
    id: string;
    originalName: string;
    sha256: string;
  } | null;
  sourceLocator: string | null;
  originKind: string;
  transformationId: string;
  ruleVersion: string;
  decision: TraceDecisionRef | null;
};

export type TraceResult = {
  entityId: string;
  entityType: string;
  status: string;
  fieldPath: string | null;
  chain: TraceProvenanceNode[];
};

export async function trace(
  client: Sql,
  tenantId: string,
  entityId: string,
  fieldPath?: string,
): Promise<TraceResult> {
  return withTenantTransaction(client, tenantId, async (db) => {
    const entityRows = await db
      .select()
      .from(qumEntities)
      .where(and(eq(qumEntities.tenantId, tenantId), eq(qumEntities.id, entityId)))
      .limit(1);
    const entity = entityRows[0];
    if (!entity) {
      throw new DataExodusError("ERR_ENTITY_NOT_FOUND", `Entity not found: ${entityId}`);
    }

    const conditions = [
      eq(qumProvenanceEntries.tenantId, tenantId),
      eq(qumProvenanceEntries.entityId, entityId),
    ];
    if (fieldPath) {
      conditions.push(eq(qumProvenanceEntries.fieldPath, fieldPath));
    }

    const rows = await db
      .select({
        entry: qumProvenanceEntries,
        artifact: qumArtifacts,
        decision: qumDecisions,
      })
      .from(qumProvenanceEntries)
      .leftJoin(
        qumArtifacts,
        and(
          eq(qumProvenanceEntries.artifactId, qumArtifacts.id),
          eq(qumProvenanceEntries.tenantId, qumArtifacts.tenantId),
        ),
      )
      .leftJoin(
        qumDecisions,
        and(
          eq(qumProvenanceEntries.decisionId, qumDecisions.id),
          eq(qumProvenanceEntries.tenantId, qumDecisions.tenantId),
        ),
      )
      .where(and(...conditions));

    const chain: TraceProvenanceNode[] = rows.map((row) => {
      const meta = row.entry.metadataJson as { sourceLocator?: string } | null;
      return {
        provenanceEntryId: row.entry.id,
        fieldPath: row.entry.fieldPath,
        artifact: row.artifact
          ? {
              id: row.artifact.id,
              originalName: row.artifact.originalName,
              sha256: row.artifact.sha256,
            }
          : null,
        sourceLocator: meta?.sourceLocator ?? null,
        originKind: row.entry.originKind,
        transformationId: row.entry.transformationId,
        ruleVersion: row.entry.ruleVersion,
        decision: row.decision
          ? {
              decisionId: row.decision.id,
              actorId: row.decision.actorId,
              action: row.decision.action,
              rationale: row.decision.rationale,
              decidedAt: row.decision.decidedAt,
            }
          : null,
      };
    });

    return {
      entityId: entity.id,
      entityType: entity.entityType,
      status: entity.status,
      fieldPath: fieldPath ?? null,
      chain,
    };
  });
}