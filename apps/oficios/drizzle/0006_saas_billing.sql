-- Planes, suscripciones, eventos de cobro y medidores. El catálogo de planes es global.

CREATE TABLE IF NOT EXISTS saas_plans (
  code TEXT PRIMARY KEY,
  max_seats INTEGER NOT NULL CHECK (max_seats >= 0),
  monthly_fiscal_intents INTEGER NOT NULL CHECK (monthly_fiscal_intents >= 0),
  max_storage_bytes BIGINT NOT NULL CHECK (max_storage_bytes >= 0),
  features_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO saas_plans (code, max_seats, monthly_fiscal_intents, max_storage_bytes, features_json)
VALUES
  ('starter', 3, 50, 1073741824, '{"whatsapp":false,"clairic":false}'::jsonb),
  ('pro', 15, 500, 10737418240, '{"whatsapp":true,"clairic":false}'::jsonb),
  ('agency', 100, 5000, 107374182400, '{"whatsapp":true,"clairic":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  tenant_id UUID PRIMARY KEY REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  plan_code TEXT NOT NULL REFERENCES saas_plans(code),
  status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL,
  grace_until TIMESTAMPTZ,
  external_subscription_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_billing_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_event_id)
);

CREATE TABLE IF NOT EXISTS saas_usage_meters (
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  period_ym TEXT NOT NULL CHECK (period_ym ~ '^[0-9]{4}-[0-9]{2}$'),
  metric_key TEXT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (tenant_id, period_ym, metric_key)
);

ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_plans_catalog ON saas_plans;
CREATE POLICY saas_plans_catalog ON saas_plans USING (true) WITH CHECK (true);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['saas_subscriptions', 'saas_billing_events', 'saas_usage_meters']
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

CREATE OR REPLACE FUNCTION saas_deny_billing_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'saas_billing_events es append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS saas_billing_events_append_only ON saas_billing_events;
CREATE TRIGGER saas_billing_events_append_only
  BEFORE UPDATE OR DELETE ON saas_billing_events
  FOR EACH ROW EXECUTE FUNCTION saas_deny_billing_event_mutation();
