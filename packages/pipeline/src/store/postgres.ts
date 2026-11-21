import { randomUUID } from "node:crypto";

import postgres from "postgres";
import type { Sql, TransactionSql } from "postgres";

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

export async function updateExecutionRunStatus(
  sql: Sql,
  tenantId: string,
  runId: string,
  status: ExecutionRunStatus,
  errorJson: Record<string, unknown> | null = null,
): Promise<void> {
  await withTenant(sql, tenantId, async (tx) => {
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
        WHERE id = ${runId}
      `;
    } else {
      await tx`
        UPDATE qum_execution_runs
        SET status = ${status},
            error_json = ${errorJson ? tx.json(errorJson as never) : null}
        WHERE id = ${runId}
      `;
    }
  });
}

export interface UpsertCheckpointInput {
  readonly runId: string;
  readonly stepId: string;
  readonly status: CheckpointStatus;
  readonly inputHash: string;
  readonly outputRef: unknown | null;
  readonly attemptCount: number;
  readonly checkpointId?: string;
}

export async function upsertCheckpoint(
  sql: Sql,
  input: UpsertCheckpointInput,
): Promise<string> {
  const id = input.checkpointId ?? randomUUID();
  await sql`
    INSERT INTO qum_checkpoints (
      id, run_id, step_id, status, input_hash, output_ref, attempt_count
    ) VALUES (
      ${id},
      ${input.runId},
      ${input.stepId},
      ${input.status},
      ${input.inputHash},
      ${input.outputRef === null ? null : sql.json(input.outputRef as never)},
      ${input.attemptCount}
    )
    ON CONFLICT (run_id, step_id) DO UPDATE SET
      status = EXCLUDED.status,
      input_hash = EXCLUDED.input_hash,
      output_ref = EXCLUDED.output_ref,
      attempt_count = EXCLUDED.attempt_count,
      updated_at = now()
  `;
  return id;
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
      WHERE id = ${runId}
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
  runId: string,
): Promise<CheckpointRecord[]> {
  const rows = await sql<
    Array<{
      id: string;
      run_id: string;
      step_id: string;
      status: CheckpointStatus;
      input_hash: string;
      output_ref: unknown | null;
      attempt_count: number;
    }>
  >`
    SELECT id, run_id, step_id, status, input_hash, output_ref, attempt_count
    FROM qum_checkpoints
    WHERE run_id = ${runId}
    ORDER BY step_id
  `;
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    status: row.status,
    inputHash: row.input_hash,
    outputRef: row.output_ref,
    attemptCount: row.attempt_count,
  }));
}