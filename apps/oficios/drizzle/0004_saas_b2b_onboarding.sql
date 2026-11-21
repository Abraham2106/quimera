-- B2B SaaS: perfil de organización, membresías e invitaciones con FORCE RLS.

CREATE TABLE IF NOT EXISTS saas_organizations (
  tenant_id UUID PRIMARY KEY REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  commercial_name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  cr_id_normalized TEXT NOT NULL CHECK (cr_id_normalized ~ '^\d{9,12}$'),
  economic_activity TEXT NOT NULL CHECK (economic_activity ~ '^\d{6}$'),
  trade_contract_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'offboarding')),
  timezone TEXT NOT NULL DEFAULT 'America/Costa_Rica',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_organizations_status_idx ON saas_organizations (status);

CREATE TABLE IF NOT EXISTS saas_memberships (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  user_sub TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'AUDITOR_READONLY')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_sub)
);

CREATE INDEX IF NOT EXISTS saas_memberships_tenant_user_idx
  ON saas_memberships (tenant_id, user_sub);

CREATE TABLE IF NOT EXISTS saas_invitations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  email_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'AUDITOR_READONLY')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_invitations_tenant_idx ON saas_invitations (tenant_id);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['saas_organizations', 'saas_memberships', 'saas_invitations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
        USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      t,
      t
    );
  END LOOP;

  EXECUTE 'DROP POLICY IF EXISTS saas_invitation_token_bootstrap ON saas_invitations';
  EXECUTE $policy$
    CREATE POLICY saas_invitation_token_bootstrap ON saas_invitations
      FOR SELECT
      USING (
        token_hash = NULLIF(current_setting('app.invitation_token_hash', true), '')
      )
  $policy$;
END;
$rls$;