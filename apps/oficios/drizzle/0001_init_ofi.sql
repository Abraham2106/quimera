-- WBS-5.1: forward-only init for OficiOS ofi_* tables.
-- Requires qum_tenants (packages/data-exodus/drizzle/0001_init_qum.sql) applied first.

CREATE TABLE IF NOT EXISTS ofi_customers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  legal_name TEXT NOT NULL,
  tax_id TEXT,
  phone TEXT,
  email TEXT,
  provenance_entity_id UUID REFERENCES qum_entities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ofi_customers_tenant_idx ON ofi_customers (tenant_id);

CREATE TABLE IF NOT EXISTS ofi_equipment (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES ofi_customers(id) ON DELETE RESTRICT,
  trade_contract_id TEXT NOT NULL,
  serial_number TEXT,
  specs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance_entity_id UUID REFERENCES qum_entities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ofi_equipment_tenant_customer_idx
  ON ofi_equipment (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS ofi_work_orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES ofi_customers(id) ON DELETE RESTRICT,
  equipment_id UUID NOT NULL REFERENCES ofi_equipment(id) ON DELETE RESTRICT,
  trade_contract_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'RECEIVED',
    'DIAGNOSED',
    'QUOTED',
    'APPROVED',
    'IN_PROGRESS',
    'VERIFIED',
    'CLOSED',
    'CANCELLED'
  )),
  quote_amount_minor BIGINT CHECK (quote_amount_minor IS NULL OR quote_amount_minor >= 0),
  currency_code TEXT,
  customer_authorized BOOLEAN NOT NULL DEFAULT false,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  fiscal_intent_id UUID REFERENCES fob_fiscal_intents(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ofi_work_orders_tenant_status_idx
  ON ofi_work_orders (tenant_id, status);

CREATE TABLE IF NOT EXISTS ofi_work_order_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL REFERENCES ofi_work_orders(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_id TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_id UUID REFERENCES qum_artifacts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ofi_work_order_events_work_order_idx
  ON ofi_work_order_events (work_order_id, created_at);