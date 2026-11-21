import { createHash, randomUUID } from "node:crypto";

import {
  assertFeXmlSafeForParsing,
  assertXlsxZipNotBomb,
  profileTables,
  proposeMapping,
  runResumableBatch,
} from "@quimera/data-exodus";
import type { MappingColumn } from "@quimera/data-exodus";

import type { OficiosSql } from "../../db/connection.js";
import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "../../domain/hvac-refrigeration-v1.js";
import { workbenchArtifactStore } from "./artifact-store.js";

async function withOfiTenantTransaction<T>(
  client: OficiosSql,
  _tenantId: string,
  fn: (tx: OficiosSql) => Promise<T>,
): Promise<T> {
  return fn(client);
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const SCHEMA_VERSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SCHEMA_SHA = "ab".repeat(32);

export class MigrationRejected extends Error {
  constructor(
    readonly status: 400 | 409 | 413,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MigrationRejected";
  }
}

type ParsedRow = {
  legalName: string;
  taxId: string;
  serial: string;
  entityId: string;
};

function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const header = lines[0];
  if (!header || !header.includes(",")) {
    throw new MigrationRejected(400, "ERR_VALIDATION", "El archivo CSV no tiene encabezado.");
  }
  const columns = header.split(",").map((column) => column.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    columns.forEach((column, index) => {
      row[column] = (cells[index] ?? "").trim();
    });
    return row;
  });
  return { columns, rows };
}

function cell(row: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value) return value;
  }
  return "";
}

function inspectUpload(name: string, mime: string, bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new MigrationRejected(413, "ERR_UPLOAD_TOO_LARGE", "El archivo supera 8 MiB.");
  }
  const text = new TextDecoder("utf8", { fatal: false }).decode(bytes);
  const looksXml = mime.includes("xml") || name.toLowerCase().endsWith(".xml") || text.trimStart().startsWith("<");
  if (looksXml) {
    try {
      assertFeXmlSafeForParsing(text);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "ERR_SEC_XXE_REJECTED";
      throw new MigrationRejected(400, code, "El XML fue rechazado por riesgo XXE.");
    }
  }
  const looksZip = mime.includes("sheet") || mime.includes("zip") || name.toLowerCase().endsWith(".xlsx") || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  if (looksZip) {
    try {
      assertXlsxZipNotBomb(bytes);
    } catch {
      throw new MigrationRejected(400, "ERR_SEC_ZIP_BOMB", "El archivo fue rechazado como zip-bomb.");
    }
  }
}

async function ensureSchema(tx: OficiosSql): Promise<void> {
  await tx`
    INSERT INTO qum_schema_versions (id, schema_name, semver, sha256, json_schema)
    VALUES (
      ${SCHEMA_VERSION_ID}::uuid,
      'oficios-v1',
      '1.0.0',
      ${SCHEMA_SHA},
      ${tx.json({})}
    )
    ON CONFLICT (schema_name, semver) DO NOTHING
  `;
}

export async function uploadMigrationSource(
  client: OficiosSql,
  tenantId: string,
  actorId: string,
  file: { name: string; mime: string; bytes: Uint8Array },
): Promise<{ runId: string; sha256: string }> {
  inspectUpload(file.name, file.mime, file.bytes);
  const stored = await workbenchArtifactStore.put({
    tenantId,
    bytes: file.bytes,
    artifactKind: "source_file",
    originalName: file.name,
    mimeType: file.mime || "application/octet-stream",
  });
  if (!stored.ok) {
    throw new MigrationRejected(400, stored.error.code, stored.error.message);
  }
  const runId = randomUUID();
  const sourceId = randomUUID();
  await withOfiTenantTransaction(client, tenantId, async (tx) => {
    await ensureSchema(tx);
    await tx`
      INSERT INTO qum_data_sources (id, tenant_id, name, source_kind)
      VALUES (
        ${sourceId}::uuid,
        ${tenantId}::uuid,
        ${`web-${runId}`},
        'csv'
      )
    `;
    await tx`
      INSERT INTO qum_artifacts (
        id, tenant_id, sha256, artifact_kind, original_name, mime_type, byte_size, storage_uri
      )
      VALUES (
        ${stored.data.id}::uuid,
        ${tenantId}::uuid,
        ${stored.data.sha256},
        'source_file',
        ${file.name},
        ${file.mime || "application/octet-stream"},
        ${file.bytes.byteLength},
        ${stored.data.storageUri}
      )
    `;
    await tx`
      INSERT INTO qum_import_batches (id, tenant_id, source_id, schema_version_id, idempotency_key, status)
      VALUES (
        ${runId}::uuid,
        ${tenantId}::uuid,
        ${sourceId}::uuid,
        ${SCHEMA_VERSION_ID}::uuid,
        ${`migration-${runId}`},
        'PENDING'
      )
    `;
    await tx`
      INSERT INTO ofi_migration_runs (
        id, tenant_id, status, original_name, mime_type, sha256, storage_uri, artifact_id, batch_id, created_by
      )
      VALUES (
        ${runId}::uuid,
        ${tenantId}::uuid,
        'UPLOADED',
        ${file.name},
        ${file.mime || "application/octet-stream"},
        ${stored.data.sha256},
        ${stored.data.storageUri},
        ${stored.data.id}::uuid,
        ${runId}::uuid,
        ${actorId}
      )
    `;
  });
  return { runId, sha256: stored.data.sha256 };
}

type RunRow = {
  id: string;
  status: string;
  original_name: string;
  sha256: string;
  storage_uri: string;
  artifact_id: string;
  batch_id: string;
  profile_json: {
    rows?: ParsedRow[];
    needsReview?: MappingColumn[];
  };
  checkpoint_json: { artifactSha256: string; completed: number; outputs: ParsedRow[] } | null;
};

async function loadRun(client: OficiosSql, tenantId: string, runId: string): Promise<RunRow | null> {
  const rows = await withOfiTenantTransaction(client, tenantId, async (tx) =>
    tx<RunRow[]>`
      SELECT id::text, status, original_name, sha256, storage_uri, artifact_id::text, batch_id::text, profile_json, checkpoint_json
      FROM ofi_migration_runs
      WHERE id = ${runId}::uuid
    `,
  );
  return rows[0] ?? null;
}

async function readArtifactBytes(storageUri: string, expectedSha: string): Promise<Uint8Array> {
  const loaded = await workbenchArtifactStore.get(storageUri);
  if (!loaded.ok) {
    throw new MigrationRejected(409, "ERR_RESUME_ARTIFACT_HASH_MISMATCH", "No se pudo leer el artefacto de origen.");
  }
  const digest = createHash("sha256").update(loaded.data).digest("hex");
  if (digest !== expectedSha) {
    throw new MigrationRejected(409, "ERR_RESUME_ARTIFACT_HASH_MISMATCH", "El SHA-256 del artefacto no coincide.");
  }
  return loaded.data;
}

export async function profileMigrationRun(client: OficiosSql, tenantId: string, runId: string) {
  const run = await loadRun(client, tenantId, runId);
  if (!run) {
    throw new MigrationRejected(400, "ERR_NOT_FOUND", "La corrida de migración no existe.");
  }
  const bytes = await readArtifactBytes(run.storage_uri, run.sha256);
  const parsed = parseCsv(new TextDecoder().decode(bytes));
  const profile = profileTables([
    { sourceId: run.original_name, columns: parsed.columns, rows: parsed.rows },
  ]);
  const mapping = proposeMapping(profile);
  const needsReview = mapping.columns.filter((column) => column.status === "NEEDS_REVIEW");
  const rows: ParsedRow[] = [];
  await withOfiTenantTransaction(client, tenantId, async (tx) => {
    await ensureSchema(tx);
    for (const row of parsed.rows) {
      const entityId = randomUUID();
      const legalName = cell(row, ["nombre", "razon_social", "legal_name"]);
      const taxId = cell(row, ["cedula", "tax_id", "identificacion"]);
      const serial = cell(row, ["serial", "serie", "serial_number"]);
      await tx`
        INSERT INTO qum_entities (
          id, tenant_id, schema_version_id, entity_type, natural_key, status, canonical_data
        )
        VALUES (
          ${entityId}::uuid,
          ${tenantId}::uuid,
          ${SCHEMA_VERSION_ID}::uuid,
          'customer',
          ${taxId || null},
          'DRAFT',
          ${tx.json({ legalName, taxId, serial })}
        )
      `;
      rows.push({ legalName, taxId, serial, entityId });
    }
    const byTax = new Map<string, ParsedRow[]>();
    for (const row of rows) {
      if (!row.taxId) continue;
      const group = byTax.get(row.taxId) ?? [];
      group.push(row);
      byTax.set(row.taxId, group);
    }
    let blocking = 0;
    for (const [taxId, group] of byTax) {
      const names = new Set(group.map((row) => row.legalName));
      if (group.length < 2 || names.size < 2) continue;
      blocking += 1;
      await tx`
        INSERT INTO qum_conflicts (
          id, tenant_id, batch_id, conflict_code, severity, status, candidate_entity_ids, evidence_refs, summary
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${tenantId}::uuid,
          ${run.batch_id}::uuid,
          'CONFLICTING_IDENTITY',
          'BLOCKING',
          'OPEN',
          ${tx.json(group.map((row) => row.entityId))},
          ${tx.json([{ artifactId: run.artifact_id }])},
          ${`Cédula ${taxId} aparece con nombres distintos`}
        )
      `;
    }
    await tx`
      UPDATE ofi_migration_runs
      SET status = ${blocking > 0 ? "BLOCKED" : "PROFILED"},
          profile_json = ${tx.json({ rows, needsReview, columns: mapping.columns })}
      WHERE id = ${runId}::uuid
    `;
  });
  return { runId, needsReview, columns: mapping.columns };
}

export async function listMigrationConflicts(client: OficiosSql, tenantId: string, runId: string) {
  const run = await loadRun(client, tenantId, runId);
  if (!run) {
    throw new MigrationRejected(400, "ERR_NOT_FOUND", "La corrida de migración no existe.");
  }
  return withOfiTenantTransaction(client, tenantId, async (tx) =>
    tx<{ id: string; status: string; summary: string; conflict_code: string }[]>`
      SELECT id::text, status, summary, conflict_code
      FROM qum_conflicts
      WHERE batch_id = ${run.batch_id}::uuid
      ORDER BY detected_at ASC
    `,
  );
}

const ACTIONS = new Set([
  "MERGE",
  "KEEP_SEPARATE",
  "OVERRIDE_FIELD",
  "REJECT_RECORD",
  "MARK_UNRECONCILABLE",
  "DEFER",
]);

export async function recordMigrationDecision(
  client: OficiosSql,
  tenantId: string,
  runId: string,
  actorId: string,
  input: { conflictId: string; action: string; rationale: string },
) {
  if (!ACTIONS.has(input.action) || input.rationale.trim().length < 3) {
    throw new MigrationRejected(400, "ERR_VALIDATION", "Acción o justificación inválida.");
  }
  const run = await loadRun(client, tenantId, runId);
  if (!run) {
    throw new MigrationRejected(400, "ERR_NOT_FOUND", "La corrida de migración no existe.");
  }
  return withOfiTenantTransaction(client, tenantId, async (tx) => {
    const conflicts = await tx<{ id: string; status: string }[]>`
      SELECT id::text, status
      FROM qum_conflicts
      WHERE id = ${input.conflictId}::uuid AND batch_id = ${run.batch_id}::uuid
    `;
    const conflict = conflicts[0];
    if (!conflict) {
      throw new MigrationRejected(400, "ERR_CONFLICT_NOT_FOUND", "El conflicto no pertenece a esta corrida.");
    }
    const prior = await tx<{ id: string; supersedes_decision_id: string | null }[]>`
      SELECT id::text, supersedes_decision_id::text
      FROM qum_decisions
      WHERE conflict_id = ${input.conflictId}::uuid
    `;
    const superseded = new Set(
      prior.map((row) => row.supersedes_decision_id).filter((id): id is string => id != null),
    );
    if (prior.some((row) => !superseded.has(row.id))) {
      throw new MigrationRejected(
        409,
        "ERR_CONFLICT_ALREADY_RESOLVED",
        "El conflicto ya tiene una decisión inmutable.",
      );
    }
    const decisionId = randomUUID();
    const nextStatus = input.action === "DEFER" ? "DEFERRED" : input.action === "MARK_UNRECONCILABLE" ? "UNRECONCILABLE" : "RESOLVED";
    await tx`
      INSERT INTO qum_decisions (
        id, tenant_id, conflict_id, action, actor_type, actor_id, rationale
      )
      VALUES (
        ${decisionId}::uuid,
        ${tenantId}::uuid,
        ${input.conflictId}::uuid,
        ${input.action},
        'HUMAN',
        ${actorId},
        ${input.rationale.trim()}
      )
    `;
    await tx`
      UPDATE qum_conflicts
      SET status = ${nextStatus}, resolved_at = now()
      WHERE id = ${input.conflictId}::uuid
    `;
    return { decisionId, actorId, status: nextStatus };
  });
}

export async function resumeMigrationRun(client: OficiosSql, tenantId: string, runId: string) {
  const run = await loadRun(client, tenantId, runId);
  if (!run) {
    throw new MigrationRejected(400, "ERR_NOT_FOUND", "La corrida de migración no existe.");
  }
  const open = await withOfiTenantTransaction(client, tenantId, async (tx) =>
    tx<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM qum_conflicts
      WHERE batch_id = ${run.batch_id}::uuid AND status IN ('OPEN', 'DEFERRED') AND severity = 'BLOCKING'
    `,
  );
  if (Number(open[0]?.count ?? "0") > 0) {
    throw new MigrationRejected(409, "ERR_MIGRATION_BLOCKED", "Hay conflictos abiertos. Resolvelos antes de reanudar.");
  }
  const bytes = await readArtifactBytes(run.storage_uri, run.sha256);
  const rows = run.profile_json.rows ?? [];
  let batch;
  try {
    batch = runResumableBatch({
      artifactBytes: bytes,
      items: rows.map((_, index) => String(index)),
      mapItem: (_item, index) => rows[index]!,
      checkpoint: run.checkpoint_json ?? undefined,
    });
  } catch {
    throw new MigrationRejected(409, "ERR_RESUME_ARTIFACT_HASH_MISMATCH", "El artefacto cambió desde el checkpoint.");
  }
  const start = run.checkpoint_json?.completed ?? 0;
  const fresh = batch.checkpoint.outputs.slice(start);
  const loaded: string[] = [];
  await withOfiTenantTransaction(client, tenantId, async (tx) => {
    for (const row of fresh) {
      const customerId = randomUUID();
      const equipmentId = randomUUID();
      await tx`
        INSERT INTO ofi_customers (id, tenant_id, legal_name, tax_id, provenance_entity_id)
        VALUES (
          ${customerId}::uuid,
          ${tenantId}::uuid,
          ${row.legalName || "Sin nombre"},
          ${row.taxId || null},
          ${row.entityId}::uuid
        )
      `;
      await tx`
        INSERT INTO ofi_equipment (
          id, tenant_id, customer_id, trade_contract_id, serial_number, provenance_entity_id
        )
        VALUES (
          ${equipmentId}::uuid,
          ${tenantId}::uuid,
          ${customerId}::uuid,
          ${HVAC_REFRIGERATION_V1_CONTRACT_ID},
          ${row.serial || null},
          ${row.entityId}::uuid
        )
      `;
      await tx`
        INSERT INTO qum_provenance_entries (
          id, tenant_id, entity_id, artifact_id, schema_version_id,
          origin_kind, transformation_id, rule_version, metadata_json
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${tenantId}::uuid,
          ${row.entityId}::uuid,
          ${run.artifact_id}::uuid,
          ${SCHEMA_VERSION_ID}::uuid,
          'DIRECT_PARSE',
          'web-workbench.resume',
          'oficios-v1@1.0.0',
          ${tx.json({ sourceLocator: `csv:row:${row.taxId}` })}
        )
      `;
      await tx`
        UPDATE qum_entities SET status = 'MIGRATED', updated_at = now()
        WHERE id = ${row.entityId}::uuid
      `;
      loaded.push(customerId);
    }
    await tx`
      UPDATE ofi_migration_runs
      SET status = 'COMPLETED',
          checkpoint_json = ${tx.json(batch.checkpoint)}
      WHERE id = ${runId}::uuid
    `;
    await tx`
      UPDATE qum_import_batches
      SET status = 'COMPLETED', finished_at = now(), parsed_ok = ${rows.length}
      WHERE id = ${run.batch_id}::uuid
    `;
  });
  return { runId, status: "COMPLETED" as const, loadedCustomerIds: loaded };
}
