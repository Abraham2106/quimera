import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { ResolutionAction } from "./types.js";

import type { QuimeraDb } from "../db/connection.js";
import { createDecisionsRepository } from "../db/repositories/decisions.js";
import { qumConflicts, qumDecisions, qumEntities } from "../db/schema/index.js";
import { DataExodusError } from "./errors.js";
import type { ApplyDecisionOptions, ApplyDecisionResult, ConflictRow } from "./types.js";

function conflictStatusForAction(action: ResolutionAction): string {
  if (action === "MARK_UNRECONCILABLE") {
    return "UNRECONCILABLE";
  }
  if (action === "DEFER") {
    return "DEFERRED";
  }
  return "RESOLVED";
}

async function loadConflict(db: QuimeraDb, tenantId: string, conflictId: string) {
  const rows = await db
    .select()
    .from(qumConflicts)
    .where(and(eq(qumConflicts.tenantId, tenantId), eq(qumConflicts.id, conflictId)))
    .limit(1);
  return rows[0];
}

/**
 * Registra una decisión inmutable sobre un conflicto. No fusiona PROBABLE_DUPLICATE automáticamente.
 */
export async function applyDecision(
  db: QuimeraDb,
  conflict: ConflictRow,
  action: ResolutionAction,
  actorId: string,
  rationale: string,
  options: ApplyDecisionOptions = {},
): Promise<ApplyDecisionResult> {
  if (rationale.trim().length < 3) {
    throw new DataExodusError(
      "ERR_DECISION_INVALID_SUPERSEDES",
      "rationale must be at least 3 characters",
    );
  }

  const fresh = await loadConflict(db, conflict.tenantId, conflict.id);
  if (!fresh) {
    throw new DataExodusError("ERR_CONFLICT_NOT_FOUND", `Conflict not found: ${conflict.id}`);
  }

  const decisionsRepo = createDecisionsRepository(db);
  const existing = await decisionsRepo.listByConflict(conflict.tenantId, conflict.id);
  const supersededIds = new Set(
    existing
      .map((d) => d.supersedesDecisionId)
      .filter((id): id is string => id != null),
  );
  const active = existing.filter((d) => !supersededIds.has(d.id));

  if (active.length > 0 && !options.supersedesDecisionId) {
    throw new DataExodusError(
      "ERR_CONFLICT_ALREADY_RESOLVED",
      `Conflict ${conflict.id} already has an active decision; use supersedesDecisionId to amend`,
      { details: { conflictId: conflict.id, decisionIds: active.map((d) => d.id) } },
    );
  }

  if (options.supersedesDecisionId) {
    const superseded = existing.find((d) => d.id === options.supersedesDecisionId);
    if (!superseded) {
      throw new DataExodusError(
        "ERR_DECISION_INVALID_SUPERSEDES",
        `supersedesDecisionId ${options.supersedesDecisionId} is not a prior decision on this conflict`,
      );
    }
  }

  if (fresh.status !== "OPEN" && fresh.status !== "DEFERRED" && !options.supersedesDecisionId) {
    throw new DataExodusError(
      "ERR_CONFLICT_ALREADY_RESOLVED",
      `Conflict ${conflict.id} is ${fresh.status}; only supersedes amendments are allowed`,
      { details: { conflictId: conflict.id, status: fresh.status } },
    );
  }

  const candidateIds = (fresh.candidateEntityIds as string[]) ?? [];

  const decision = await decisionsRepo.insert({
    id: randomUUID(),
    tenantId: conflict.tenantId,
    conflictId: conflict.id,
    action,
    actorType: options.actorType ?? "HUMAN",
    actorId,
    rationale: rationale.trim(),
    payloadJson: options.payload ?? {},
    supersedesDecisionId: options.supersedesDecisionId ?? null,
  });

  const nextStatus = conflictStatusForAction(action);
  await db
    .update(qumConflicts)
    .set({
      status: nextStatus,
      resolvedAt: nextStatus === "OPEN" ? null : new Date(),
    })
    .where(and(eq(qumConflicts.tenantId, conflict.tenantId), eq(qumConflicts.id, conflict.id)));

  if (
    candidateIds.length > 0 &&
    action !== "MARK_UNRECONCILABLE" &&
    action !== "REJECT_RECORD" &&
    action !== "DEFER"
  ) {
    await db
      .update(qumEntities)
      .set({ status: "VERIFIED", updatedAt: new Date() })
      .where(
        and(
          eq(qumEntities.tenantId, conflict.tenantId),
          inArray(qumEntities.id, candidateIds),
          isNull(qumEntities.supersededById),
        ),
      );
  }

  return { decision, conflictStatus: nextStatus };
}

export async function applyDecisionById(
  db: QuimeraDb,
  tenantId: string,
  conflictId: string,
  action: ResolutionAction,
  actorId: string,
  rationale: string,
  options?: ApplyDecisionOptions,
): Promise<ApplyDecisionResult> {
  const row = await loadConflict(db, tenantId, conflictId);
  if (!row) {
    throw new DataExodusError("ERR_CONFLICT_NOT_FOUND", `Conflict not found: ${conflictId}`);
  }
  const conflict: ConflictRow = {
    id: row.id,
    tenantId: row.tenantId,
    conflictCode: row.conflictCode,
    severity: row.severity,
    status: row.status,
    candidateEntityIds: row.candidateEntityIds as string[],
  };
  return applyDecision(db, conflict, action, actorId, rationale, options);
}

export async function hasActiveDecision(db: QuimeraDb, tenantId: string, conflictId: string) {
  const rows = await db
    .select({ id: qumDecisions.id, supersedes: qumDecisions.supersedesDecisionId })
    .from(qumDecisions)
    .where(and(eq(qumDecisions.tenantId, tenantId), eq(qumDecisions.conflictId, conflictId)));
  const supersededIds = new Set(
    rows.map((r) => r.supersedes).filter((id): id is string => id != null),
  );
  return rows.some((r) => !supersededIds.has(r.id));
}