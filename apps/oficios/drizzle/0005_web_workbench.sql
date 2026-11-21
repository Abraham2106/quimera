-- Portal de migración y cola idempotente de la PWA (Oleada 3).

ALTER TABLE ofi_diagnosis_attachments
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_uri TEXT;

CREATE TABLE IF NOT EXISTS ofi_migration_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('UPLOADED', 'PROFILED', 'BLOCKED', 'COMPLETED')),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_uri TEXT NOT NULL,
  artifact_id UUID NOT NULL REFERENCES qum_artifacts(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES qum_import_batches(id) ON DELETE RESTRICT,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint_json JSONB,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ofi_migration_runs_tenant_idx
  ON ofi_migration_runs (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS ofi_client_mutations (
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  client_mutation_id UUID NOT NULL,
  work_order_id UUID NOT NULL REFERENCES ofi_work_orders(id) ON DELETE RESTRICT,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_mutation_id)
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ofi_migration_runs', 'ofi_client_mutations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
        USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      t, t
    );
  END LOOP;
END;
$rls$;
