-- WBS-1.4: forward-only init for core qum_* tables, indexes, and tenant RLS.
-- Apply: psql "$DATABASE_URL" -f packages/data-exodus/drizzle/0001_init_qum.sql

CREATE TABLE IF NOT EXISTS qum_tenants (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qum_schema_versions (
  id UUID PRIMARY KEY,
  schema_name TEXT NOT NULL,
  semver TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  json_schema JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schema_name, semver)
);

CREATE TABLE IF NOT EXISTS qum_data_sources (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('csv', 'xlsx', 'fe_xml', 'sqlite', 'json', 'pdf', 'manual')),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS qum_artifacts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN (
    'source_file', 'fe_xml_unsigned', 'fe_xml_signed', 'hacienda_response',
    'work_order_photo', 'approval_proof', 'reconciliation_report'
  )),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  storage_uri TEXT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sha256, artifact_kind),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS qum_import_batches (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  source_id UUID NOT NULL REFERENCES qum_data_sources(id) ON DELETE RESTRICT,
  schema_version_id UUID NOT NULL REFERENCES qum_schema_versions(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  total_rows_seen INTEGER NOT NULL DEFAULT 0 CHECK (total_rows_seen >= 0),
  parsed_ok INTEGER NOT NULL DEFAULT 0 CHECK (parsed_ok >= 0),
  parse_errors INTEGER NOT NULL DEFAULT 0 CHECK (parse_errors >= 0),
  skipped_empty INTEGER NOT NULL DEFAULT 0 CHECK (skipped_empty >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS qum_raw_records (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES qum_import_batches(id) ON DELETE RESTRICT,
  artifact_id UUID NOT NULL REFERENCES qum_artifacts(id) ON DELETE RESTRICT,
  source_locator TEXT NOT NULL,
  record_hash TEXT NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  raw_payload JSONB NOT NULL,
  parse_status TEXT NOT NULL CHECK (parse_status IN ('OK', 'ERROR', 'SKIPPED')),
  parse_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_id, source_locator)
);

CREATE TABLE IF NOT EXISTS qum_entities (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  schema_version_id UUID NOT NULL REFERENCES qum_schema_versions(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  natural_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'VERIFIED', 'BLOCKED', 'SUPERSEDED', 'MIGRATED')),
  canonical_data JSONB NOT NULL,
  superseded_by_id UUID REFERENCES qum_entities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS qum_conflicts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES qum_import_batches(id) ON DELETE RESTRICT,
  conflict_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('BLOCKING', 'WARNING', 'INFO')),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'DEFERRED', 'UNRECONCILABLE')),
  candidate_entity_ids JSONB NOT NULL,
  evidence_refs JSONB NOT NULL,
  summary TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS qum_decisions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  conflict_id UUID NOT NULL REFERENCES qum_conflicts(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('MERGE', 'KEEP_SEPARATE', 'OVERRIDE_FIELD', 'REJECT_RECORD', 'MARK_UNRECONCILABLE', 'DEFER')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('RULE', 'HUMAN')),
  actor_id TEXT NOT NULL,
  rationale TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  supersedes_decision_id UUID REFERENCES qum_decisions(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qum_entity_relations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  from_entity_id UUID NOT NULL REFERENCES qum_entities(id) ON DELETE RESTRICT,
  to_entity_id UUID NOT NULL REFERENCES qum_entities(id) ON DELETE RESTRICT,
  relation_type TEXT NOT NULL,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('EXACT', 'RULE_VERIFIED', 'HUMAN_APPROVED')),
  decision_id UUID REFERENCES qum_decisions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_entity_id, to_entity_id, relation_type)
);

CREATE TABLE IF NOT EXISTS qum_provenance_entries (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  entity_id UUID NOT NULL REFERENCES qum_entities(id) ON DELETE RESTRICT,
  field_path TEXT NOT NULL DEFAULT '*',
  raw_record_id UUID REFERENCES qum_raw_records(id) ON DELETE RESTRICT,
  artifact_id UUID NOT NULL REFERENCES qum_artifacts(id) ON DELETE RESTRICT,
  schema_version_id UUID NOT NULL REFERENCES qum_schema_versions(id) ON DELETE RESTRICT,
  decision_id UUID REFERENCES qum_decisions(id) ON DELETE RESTRICT,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('DIRECT_PARSE', 'RULE_TRANSFORM', 'HUMAN_DECISION', 'EXTERNAL_API', 'AI_EXTRACTION')),
  transformation_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qum_execution_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  pipeline_id TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_json JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS qum_checkpoints (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  run_id UUID NOT NULL REFERENCES qum_execution_runs(id) ON DELETE RESTRICT,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'WAITING_FOR_APPROVAL', 'FAILED')),
  input_hash TEXT NOT NULL,
  output_ref JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  decision_json JSONB,
  decision_consumed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_id),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES qum_execution_runs (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS qum_raw_records_tenant_record_hash_idx ON qum_raw_records (tenant_id, record_hash);

CREATE INDEX IF NOT EXISTS qum_entities_tenant_type_natural_key_idx
  ON qum_entities (tenant_id, entity_type, natural_key)
  WHERE status <> 'SUPERSEDED';

CREATE INDEX IF NOT EXISTS qum_entities_canonical_data_gin_idx
  ON qum_entities USING gin (canonical_data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS qum_provenance_tenant_entity_field_idx
  ON qum_provenance_entries (tenant_id, entity_id, field_path);

CREATE INDEX IF NOT EXISTS qum_provenance_tenant_artifact_idx
  ON qum_provenance_entries (tenant_id, artifact_id);

CREATE INDEX IF NOT EXISTS qum_conflicts_tenant_status_severity_idx
  ON qum_conflicts (tenant_id, status, severity);

-- Row-Level Security (tenant isolation via SET LOCAL app.current_tenant_id)
DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'qum_data_sources',
    'qum_artifacts',
    'qum_import_batches',
    'qum_raw_records',
    'qum_entities',
    'qum_conflicts',
    'qum_decisions',
    'qum_entity_relations',
    'qum_provenance_entries',
    'qum_execution_runs',
    'qum_checkpoints'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
        USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)
        WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      t, t
    );
  END LOOP;
END;
$rls$;