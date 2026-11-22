CREATE TABLE IF NOT EXISTS fob_fiscal_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES qum_tenants (id) ON DELETE CASCADE,
  issuer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('p12', 'pin', 'idp_password', 'idp_username')),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  dek_wrapped TEXT NOT NULL,
  cert_not_after TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issuer_id, kind, environment)
);

CREATE TABLE IF NOT EXISTS fob_fiscal_issuer_config (
  tenant_id UUID NOT NULL REFERENCES qum_tenants (id) ON DELETE CASCADE,
  issuer_id TEXT NOT NULL,
  active_environment TEXT NOT NULL DEFAULT 'sandbox'
    CHECK (active_environment IN ('sandbox', 'production')),
  promoted_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, issuer_id)
);

DO $rls$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['fob_fiscal_credentials', 'fob_fiscal_issuer_config']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
        USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      tbl,
      tbl
    );
  END LOOP;
END;
$rls$;