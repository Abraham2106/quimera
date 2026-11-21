CREATE TABLE IF NOT EXISTS saas_audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_audit_logs_tenant_created_idx
  ON saas_audit_logs (tenant_id, created_at DESC);

ALTER TABLE saas_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_saas_audit_logs ON saas_audit_logs;
CREATE POLICY tenant_isolation_saas_audit_logs ON saas_audit_logs
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION saas_deny_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'saas_audit_logs es append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS saas_audit_logs_append_only ON saas_audit_logs;
CREATE TRIGGER saas_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON saas_audit_logs
  FOR EACH ROW EXECUTE FUNCTION saas_deny_audit_mutation();
