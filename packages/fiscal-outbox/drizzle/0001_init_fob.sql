-- WBS-6.1: forward-only init for fiscal-outbox fob_* tables.
-- Requires qum_tenants (packages/data-exodus/drizzle/0001_init_qum.sql) applied first.

CREATE TABLE IF NOT EXISTS fob_fiscal_sequences (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  issuer_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production', 'mock')),
  branch CHAR(3) NOT NULL CHECK (branch ~ '^[0-9]{3}$'),
  terminal CHAR(5) NOT NULL CHECK (terminal ~ '^[0-9]{5}$'),
  doc_type CHAR(2) NOT NULL CHECK (doc_type ~ '^[0-9]{2}$'),
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0 AND last_number <= 9999999999),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issuer_id, environment, branch, terminal, doc_type)
);

CREATE TABLE IF NOT EXISTS fob_fiscal_intents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  issuer_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production', 'mock')),
  operation_id TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'primary',
  doc_type CHAR(2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'DOCUMENT_ASSIGNED', 'COMPLETED', 'REQUIRES_REVIEW', 'CANCELLED')),
  payload_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, environment, operation_id, purpose)
);

CREATE TABLE IF NOT EXISTS fob_fiscal_documents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  intent_id UUID NOT NULL UNIQUE REFERENCES fob_fiscal_intents(id) ON DELETE RESTRICT,
  clave CHAR(50) NOT NULL UNIQUE CHECK (clave ~ '^[0-9]{50}$'),
  consecutivo CHAR(20) NOT NULL CHECK (consecutivo ~ '^[0-9]{20}$'),
  delivery_state TEXT NOT NULL CHECK (delivery_state IN (
    'FIRMADO', 'PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ALMACENADO', 'VENCIDO', 'INCIERTO'
  )),
  unsigned_xml_artifact_id UUID REFERENCES qum_artifacts(id) ON DELETE RESTRICT,
  signed_xml_artifact_id UUID REFERENCES qum_artifacts(id) ON DELETE RESTRICT,
  response_artifact_id UUID REFERENCES qum_artifacts(id) ON DELETE RESTRICT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_poll_at TIMESTAMPTZ,
  last_error_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fob_fiscal_documents_poll_idx
  ON fob_fiscal_documents (delivery_state, next_poll_at)
  WHERE delivery_state IN ('FIRMADO', 'PENDIENTE', 'ENVIADO');