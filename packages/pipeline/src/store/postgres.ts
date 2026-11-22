import { randomUUID } from "node:crypto";

import postgres from "postgres";
import type { Sql, TransactionSql } from "postgres";

import type { HumanDecision } from "../schemas.js";
import type {
  CheckpointRecord,
  CheckpointStatus,
  ExecutionRunRecord,
  ExecutionRunStatus,
} from "../types.js";

const DEFAULT_DATABASE_URL =
  "postgres://quimera:quimera@127.0.0.1:5432/quimera";

export function createPipelineSql(
  databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): Sql {
  return postgres(databaseUrl, { max: 5 });
}

async function withTenant<T>(
  sql: Sql,
  tenantId: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export interface CreateRunInput {
  readonly tenantId: string;
  readonly pipelineId: string;
  readonly pipelineVersion: string;
  readonly runId?: string;
}

export async function createExecutionRun(
  sql: Sql,
  input: CreateRunInput,
): Promise<ExecutionRunRecord> {
  const id = input.runId ?? randomUUID();
  await withTenant(sql, input.tenantId, async (tx) => {
    await tx`
      INSERT INTO qum_execution_runs (
        id, tenant_id, pipeline_id, pipeline_version, status
      ) VALUES (
        ${id},
        ${input.tenantId},
        ${input.pipelineId},
        ${input.pipelineVersion},
        ${"RUNNING"}
      )
    `;
  });
  return {
    id,
    tenantId: input.tenantId,
    pipelineId: input.pipelineId,
    pipelineVersion: input.pipelineVersion,
    status: "RUNNING",
    metricsJson: {},
    errorJson: null,
  };
}

async function writeRunStatus(
  tx: TransactionSql,
  tenantId: string,
  runId: string,
  status: ExecutionRunStatus,
  errorJson: Record<string, unknown> | null = null,
): Promise<void> {
  const finished =
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "WAITING_FOR_APPROVAL";
  if (finished) {
    await tx`
      UPDATE qum_execution_runs
      SET status = ${status},
          error_json = ${errorJson ? tx.json(errorJson as never) : null},
          finished_at = now()
      WHERE id = ${runId} AND tenant_id = ${tenantId}::uuid
    `;
  } else {
    await tx`
      UPDATE qum_execution_runs
      SET status = ${status},
          error_json = ${errorJson ? tx.json(errorJson as never) : null}
      WHERE id = ${runId} AND tenant_id = ${tenantId}::uuid
    `;
  }
}

export async function updateExecutionRunStatus(
  sql: Sql,
  tenantId: string,
  runId: string,
  status: ExecutionRunStatus,
  errorJson: Record<string, unknown> | null = null,
): Promise<void> {
  await withTenant(sql, tenantId, async (tx) => {
    await writeRunStatus(tx, tenantId, runId, status, errorJson);
  });
}

export interface UpsertCheckpointInput {
  readonly tenantId: string;
  readonly runId: string;
  readonly stepId: string;
  readonly status: CheckpointStatus;
  readonly inputHash: string;
  readonly outputRef: unknown | null;
  /** Número real de ejecuciones del paso (incluye reintentos y reanudaciones). */
  readonly attemptCount: number;
  readonly checkpointId?: string;
  /** Marca la decisión humana como consumida al re-ejecutar una compuerta. */
  readonly consumeDecision?: boolean;
}

async function writeCheckpoint(
  tx: TransactionSql,
  input: UpsertCheckpointInput,
): Promise<string> {
  const id = input.checkpointId ?? randomUUID();
  const consumedAt = input.consumeDecision ? new Date().toISOString() : null;
  await tx`
    INSERT INTO qum_checkpoints (
      id, tenant_id, run_id, step_id, status, input_hash, output_ref,
      attempt_count, decision_consumed_at
    ) VALUES (
      ${id},
      ${input.tenantId}::uuid,
      ${input.runId},
      ${input.stepId},
      ${input.status},
      ${input.inputHash},
      ${input.outputRef === null ? null : tx.json(input.outputRef as never)},
      ${input.attemptCount},
      ${consumedAt}
    )
    ON CONFLICT (run_id, step_id) DO UPDATE SET
      status = EXCLUDED.status,
      input_hash = EXCLUDED.input_hash,
      output_ref = EXCLUDED.output_ref,
      attempt_count = EXCLUDED.attempt_count,
      decision_consumed_at = COALESCE(
        EXCLUDED.decision_consumed_at,
        qum_checkpoints.decision_consumed_at
      ),
      updated_at = now()
  `;
  return id;
}

export async function upsertCheckpoint(
  sql: Sql,
  input: UpsertCheckpointInput,
): Promise<string> {
  return withTenant(sql, input.tenantId, async (tx) => writeCheckpoint(tx, input));
}

export interface PersistStepCheckpointInput extends UpsertCheckpointInput {
  readonly runStatus?: ExecutionRunStatus;
  readonly errorJson?: Record<string, unknown> | null;
}

/**
 * Escribe el checkpoint y el estado final del run en UNA sola transacción,
 * de modo que nunca quede un checkpoint COMPLETADO con el run RUNNING (ni
 * viceversa) si falla una de las dos sentencias.
 */
export async function persistStepCheckpoint(
  sql: Sql,
  input: PersistStepCheckpointInput,
): Promise<string> {
  return withTenant(sql, input.tenantId, async (tx) => {
    const id = await writeCheckpoint(tx, input);
    if (input.runStatus) {
      await writeRunStatus(tx, input.tenantId, input.runId, input.runStatus, input.errorJson ?? null);
    }
    return id;
  });
}

export interface RecordHumanDecisionInput {
  readonly tenantId: string;
  readonly runId: string;
  readonly stepId?: string;
  readonly decision: HumanDecision;
}

/**
 * Persiste la decisión humana sobre la compuerta ANTES de que el runner pueda
 * re-ejecutarla. Devuelve false si no existe una compuerta en espera.
 */
export async function recordHumanDecision(
  sql: Sql,
  input: RecordHumanDecisionInput,
): Promise<boolean> {
  return withTenant(sql, input.tenantId, async (tx) => {
    const rows = await tx<Array<{ id: string }>>`
      UPDATE qum_checkpoints
      SET decision_json = ${tx.json(input.decision as never)},
          decision_consumed_at = NULL,
          updated_at = now()
      WHERE run_id = ${input.runId}
        AND status = 'WAITING_FOR_APPROVAL'
        AND (${input.stepId ?? null}::text IS NULL OR step_id = ${input.stepId ?? null})
      RETURNING id
    `;
    return rows.length > 0;
  });
}

export async function getExecutionRun(
  sql: Sql,
  tenantId: string,
  runId: string,
): Promise<ExecutionRunRecord | null> {
  return withTenant(sql, tenantId, async (tx) => {
    const rows = await tx<
      Array<{
        id: string;
        tenant_id: string;
        pipeline_id: string;
        pipeline_version: string;
        status: ExecutionRunStatus;
        metrics_json: Record<string, unknown>;
        error_json: Record<string, unknown> | null;
      }>
    >`
      SELECT id, tenant_id, pipeline_id, pipeline_version, status, metrics_json, error_json
      FROM qum_execution_runs
      WHERE id = ${runId} AND tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      pipelineId: row.pipeline_id,
      pipelineVersion: row.pipeline_version,
      status: row.status,
      metricsJson: row.metrics_json ?? {},
      errorJson: row.error_json,
    };
  });
}

export async function listCheckpoints(
  sql: Sql,
  tenantId: string,
  runId: string,
): Promise<CheckpointRecord[]> {
  return withTenant(sql, tenantId, async (tx) => {
    const rows = await tx<
      Array<{
        id: string;
        tenant_id: string;
        run_id: string;
        step_id: string;
        status: CheckpointStatus;
        input_hash: string;
        output_ref: unknown | null;
        attempt_count: number;
        decision_json: HumanDecision | null;
        decision_consumed_at: string | Date | null;
      }>
    >`
      SELECT id, tenant_id, run_id, step_id, status, input_hash, output_ref,
             attempt_count, decision_json, decision_consumed_at
      FROM qum_checkpoints
      WHERE run_id = ${runId} AND tenant_id = ${tenantId}::uuid
      ORDER BY step_id
    `;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      runId: row.run_id,
      stepId: row.step_id,
      status: row.status,
      inputHash: row.input_hash,
      outputRef: row.output_ref,
      attemptCount: row.attempt_count,
      decisionJson: row.decision_json,
      decisionConsumedAt: row.decision_consumed_at
        ? new Date(row.decision_consumed_at).toISOString()
        : null,
    }));
  });
}
