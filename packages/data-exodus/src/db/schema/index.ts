import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const qumTenants = pgTable("qum_tenants", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const qumSchemaVersions = pgTable(
  "qum_schema_versions",
  {
    id: uuid("id").primaryKey(),
    schemaName: text("schema_name").notNull(),
    semver: text("semver").notNull(),
    sha256: text("sha256").notNull(),
    jsonSchema: jsonb("json_schema").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("qum_schema_versions_schema_name_semver").on(table.schemaName, table.semver)],
);

export const qumDataSources = pgTable(
  "qum_data_sources",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sourceKind: text("source_kind").notNull(),
    configJson: jsonb("config_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("qum_data_sources_tenant_id_name").on(table.tenantId, table.name),
    check(
      "qum_data_sources_source_kind_check",
      sql`${table.sourceKind} IN ('csv', 'xlsx', 'fe_xml', 'sqlite', 'json', 'pdf', 'manual')`,
    ),
  ],
);

export const qumArtifacts = pgTable(
  "qum_artifacts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    sha256: text("sha256").notNull(),
    artifactKind: text("artifact_kind").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    storageUri: text("storage_uri").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("qum_artifacts_tenant_sha_kind").on(
      table.tenantId,
      table.sha256,
      table.artifactKind,
    ),
    unique("qum_artifacts_tenant_id").on(table.tenantId, table.id),
    check("qum_artifacts_sha256_check", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
    check("qum_artifacts_byte_size_check", sql`${table.byteSize} >= 0`),
    check(
      "qum_artifacts_artifact_kind_check",
      sql`${table.artifactKind} IN (
        'source_file', 'fe_xml_unsigned', 'fe_xml_signed', 'hacienda_response',
        'work_order_photo', 'approval_proof', 'reconciliation_report'
      )`,
    ),
  ],
);

export const qumImportBatches = pgTable(
  "qum_import_batches",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => qumDataSources.id, { onDelete: "restrict" }),
    schemaVersionId: uuid("schema_version_id")
      .notNull()
      .references(() => qumSchemaVersions.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    totalRowsSeen: integer("total_rows_seen").notNull().default(0),
    parsedOk: integer("parsed_ok").notNull().default(0),
    parseErrors: integer("parse_errors").notNull().default(0),
    skippedEmpty: integer("skipped_empty").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    unique("qum_import_batches_tenant_idempotency").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    unique("qum_import_batches_tenant_id").on(table.tenantId, table.id),
    check(
      "qum_import_batches_status_check",
      sql`${table.status} IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')`,
    ),
    check("qum_import_batches_total_rows_seen_check", sql`${table.totalRowsSeen} >= 0`),
    check("qum_import_batches_parsed_ok_check", sql`${table.parsedOk} >= 0`),
    check("qum_import_batches_parse_errors_check", sql`${table.parseErrors} >= 0`),
    check("qum_import_batches_skipped_empty_check", sql`${table.skippedEmpty} >= 0`),
  ],
);

export const qumRawRecords = pgTable(
  "qum_raw_records",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => qumImportBatches.id, { onDelete: "restrict" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => qumArtifacts.id, { onDelete: "restrict" }),
    sourceLocator: text("source_locator").notNull(),
    recordHash: text("record_hash").notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    parseStatus: text("parse_status").notNull(),
    parseError: text("parse_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("qum_raw_records_tenant_batch_locator").on(
      table.tenantId,
      table.batchId,
      table.sourceLocator,
    ),
    index("qum_raw_records_tenant_record_hash_idx").on(
      table.tenantId,
      table.recordHash,
    ),
    check("qum_raw_records_record_hash_check", sql`${table.recordHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "qum_raw_records_parse_status_check",
      sql`${table.parseStatus} IN ('OK', 'ERROR', 'SKIPPED')`,
    ),
  ],
);

export const qumEntities = pgTable(
  "qum_entities",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    schemaVersionId: uuid("schema_version_id")
      .notNull()
      .references(() => qumSchemaVersions.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    naturalKey: text("natural_key"),
    status: text("status").notNull(),
    canonicalData: jsonb("canonical_data").notNull(),
    supersededById: uuid("superseded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("qum_entities_tenant_id").on(table.tenantId, table.id),
    foreignKey({
      name: "qum_entities_superseded_by_id_fkey",
      columns: [table.supersededById],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    index("qum_entities_tenant_type_natural_key_idx")
      .on(table.tenantId, table.entityType, table.naturalKey)
      .where(sql`${table.status} <> 'SUPERSEDED'`),
    check(
      "qum_entities_status_check",
      sql`${table.status} IN ('DRAFT', 'VERIFIED', 'BLOCKED', 'SUPERSEDED', 'MIGRATED')`,
    ),
  ],
);

export const qumConflicts = pgTable(
  "qum_conflicts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id").references(() => qumImportBatches.id, {
      onDelete: "restrict",
    }),
    conflictCode: text("conflict_code").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    candidateEntityIds: jsonb("candidate_entity_ids").notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull(),
    summary: text("summary").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("qum_conflicts_tenant_status_severity_idx").on(
      table.tenantId,
      table.status,
      table.severity,
    ),
    check(
      "qum_conflicts_severity_check",
      sql`${table.severity} IN ('BLOCKING', 'WARNING', 'INFO')`,
    ),
    check(
      "qum_conflicts_status_check",
      sql`${table.status} IN ('OPEN', 'RESOLVED', 'DEFERRED', 'UNRECONCILABLE')`,
    ),
  ],
);

export const qumDecisions = pgTable(
  "qum_decisions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    conflictId: uuid("conflict_id")
      .notNull()
      .references(() => qumConflicts.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    rationale: text("rationale").notNull(),
    payloadJson: jsonb("payload_json").notNull().default(sql`'{}'::jsonb`),
    supersedesDecisionId: uuid("supersedes_decision_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Gate concurrente: como máximo una decisión raíz (activa) por conflicto.
    uniqueIndex("qum_decisions_one_active_per_conflict")
      .on(table.tenantId, table.conflictId)
      .where(sql`${table.supersedesDecisionId} IS NULL`),
    foreignKey({
      name: "qum_decisions_supersedes_decision_id_fkey",
      columns: [table.supersedesDecisionId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    check(
      "qum_decisions_action_check",
      sql`${table.action} IN ('MERGE', 'KEEP_SEPARATE', 'OVERRIDE_FIELD', 'REJECT_RECORD', 'MARK_UNRECONCILABLE', 'DEFER')`,
    ),
    check(
      "qum_decisions_actor_type_check",
      sql`${table.actorType} IN ('RULE', 'HUMAN')`,
    ),
  ],
);

export const qumEntityRelations = pgTable(
  "qum_entity_relations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => qumEntities.id, { onDelete: "restrict" }),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => qumEntities.id, { onDelete: "restrict" }),
    relationType: text("relation_type").notNull(),
    confidenceLevel: text("confidence_level").notNull(),
    decisionId: uuid("decision_id").references(() => qumDecisions.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("qum_entity_relations_unique").on(
      table.tenantId,
      table.fromEntityId,
      table.toEntityId,
      table.relationType,
    ),
    check(
      "qum_entity_relations_confidence_check",
      sql`${table.confidenceLevel} IN ('EXACT', 'RULE_VERIFIED', 'HUMAN_APPROVED')`,
    ),
  ],
);

export const qumProvenanceEntries = pgTable(
  "qum_provenance_entries",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => qumEntities.id, { onDelete: "restrict" }),
    fieldPath: text("field_path").notNull().default("*"),
    rawRecordId: uuid("raw_record_id").references(() => qumRawRecords.id, {
      onDelete: "restrict",
    }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => qumArtifacts.id, { onDelete: "restrict" }),
    schemaVersionId: uuid("schema_version_id")
      .notNull()
      .references(() => qumSchemaVersions.id, { onDelete: "restrict" }),
    decisionId: uuid("decision_id").references(() => qumDecisions.id, {
      onDelete: "restrict",
    }),
    originKind: text("origin_kind").notNull(),
    transformationId: text("transformation_id").notNull(),
    ruleVersion: text("rule_version").notNull(),
    metadataJson: jsonb("metadata_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("qum_provenance_tenant_entity_field_idx").on(
      table.tenantId,
      table.entityId,
      table.fieldPath,
    ),
    index("qum_provenance_tenant_artifact_idx").on(table.tenantId, table.artifactId),
    check(
      "qum_provenance_origin_kind_check",
      sql`${table.originKind} IN ('DIRECT_PARSE', 'RULE_TRANSFORM', 'HUMAN_DECISION', 'EXTERNAL_API', 'AI_EXTRACTION')`,
    ),
  ],
);

export const qumExecutionRuns = pgTable(
  "qum_execution_runs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    pipelineId: text("pipeline_id").notNull(),
    pipelineVersion: text("pipeline_version").notNull(),
    status: text("status").notNull(),
    metricsJson: jsonb("metrics_json").notNull().default(sql`'{}'::jsonb`),
    errorJson: jsonb("error_json"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    unique("qum_execution_runs_tenant_id").on(table.tenantId, table.id),
    check(
      "qum_execution_runs_status_check",
      sql`${table.status} IN ('RUNNING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')`,
    ),
  ],
);

export const qumCheckpoints = pgTable(
  "qum_checkpoints",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => qumTenants.id, { onDelete: "restrict" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => qumExecutionRuns.id, { onDelete: "restrict" }),
    stepId: text("step_id").notNull(),
    status: text("status").notNull(),
    inputHash: text("input_hash").notNull(),
    outputRef: jsonb("output_ref"),
    attemptCount: integer("attempt_count").notNull().default(0),
    decisionJson: jsonb("decision_json"),
    decisionConsumedAt: timestamp("decision_consumed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("qum_checkpoints_run_step").on(table.runId, table.stepId),
    foreignKey({
      columns: [table.tenantId, table.runId],
      foreignColumns: [qumExecutionRuns.tenantId, qumExecutionRuns.id],
      name: "qum_checkpoints_tenant_run_fkey",
    }),
    check(
      "qum_checkpoints_status_check",
      sql`${table.status} IN ('PENDING', 'RUNNING', 'COMPLETED', 'WAITING_FOR_APPROVAL', 'FAILED')`,
    ),
  ],
);

export const qumSchema = {
  qumTenants,
  qumSchemaVersions,
  qumDataSources,
  qumArtifacts,
  qumImportBatches,
  qumRawRecords,
  qumEntities,
  qumConflicts,
  qumDecisions,
  qumEntityRelations,
  qumProvenanceEntries,
  qumExecutionRuns,
  qumCheckpoints,
};