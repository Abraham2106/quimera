-- Diagnóstico con mediciones/adjuntos SHA-256 y materiales CAByS (QR-OFI-005).

CREATE TABLE IF NOT EXISTS ofi_diagnoses (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL,
  notes TEXT NOT NULL,
  measurements_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES ofi_work_orders (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ofi_diagnoses_work_order_idx
  ON ofi_diagnoses (tenant_id, work_order_id, created_at);

CREATE TABLE IF NOT EXISTS ofi_diagnosis_attachments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  diagnosis_id UUID NOT NULL,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, diagnosis_id)
    REFERENCES ofi_diagnoses (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ofi_materials (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL,
  cabys_code TEXT NOT NULL CHECK (cabys_code ~ '^[0-9]{8}$' OR cabys_code ~ '^[0-9]{13}$'),
  quantity_text TEXT NOT NULL CHECK (quantity_text ~ '^[0-9]+(\.[0-9]{1,4})?$'),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  tax_rate_bps INTEGER NOT NULL CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES ofi_work_orders (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ofi_materials_work_order_idx
  ON ofi_materials (tenant_id, work_order_id);
