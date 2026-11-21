# Diseño de Base de Datos Relacional (PostgreSQL 16+) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [ERD](./ERD.md) | [ADR-003](../04-architecture/ADR/ADR-003-postgresql-primary-store.md) | [ADR-010](../04-architecture/ADR/ADR-010-fiscal-testing-and-outbox-boundaries.md)

---

## 1. Convenciones Físicas

- **Motor:** PostgreSQL 16+ (encoding UTF-8, timezone UTC en almacenamiento, representación CR `America/Costa_Rica` en presentación).
- **Esquemas lógicos / prefijos:**
  - `qum_*` — Core, Data Exodus y Pipeline.
  - `fob_*` — Fiscal Outbox (opcional; se instala únicamente si el usuario instala `@quimera/fiscal-outbox`).
  - `ofi_*` — OficiOS (aislado; se instala únicamente con `apps/oficios`).
- **Claves primarias:** `uuid` generados como UUIDv7 (ordenables temporalmente, bajo impacto en índices B-Tree).
- **Montos monetarios:** Almacenados en **unidades menores enteras (`BIGINT`)** o `NUMERIC(18,5)` conforme a precisión fiscal de Hacienda FE 4.4 (5 decimales) — **nunca `REAL` ni `DOUBLE PRECISION`**.
- **Timestamps:** Siempre `TIMESTAMPTZ` (`DEFAULT now()`).
- **Aislamiento de inquilinos:** Todas las tablas de negocio incluyen `tenant_id UUID NOT NULL` y políticas **Row-Level Security (RLS)** activables con `SET LOCAL app.current_tenant_id = '<uuid>'`.

---

## 2. Propuesta de DDL Canónico (Núcleo `qum_*`)

```sql
CREATE TABLE qum_tenants (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE qum_schema_versions (
  id UUID PRIMARY KEY,
  schema_name TEXT NOT NULL,
  semver TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  json_schema JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schema_name, semver)
);

CREATE TABLE qum_data_sources (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('csv', 'xlsx', 'fe_xml', 'sqlite', 'json', 'pdf', 'manual')),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE qum_artifacts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
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
  UNIQUE (tenant_id, sha256, artifact_kind)
);

CREATE TABLE qum_import_batches (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  source_id UUID NOT NULL REFERENCES qum_data_sources(id),
  schema_version_id UUID NOT NULL REFERENCES qum_schema_versions(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  total_rows_seen INTEGER NOT NULL DEFAULT 0 CHECK (total_rows_seen >= 0),
  parsed_ok INTEGER NOT NULL DEFAULT 0 CHECK (parsed_ok >= 0),
  parse_errors INTEGER NOT NULL DEFAULT 0 CHECK (parse_errors >= 0),
  skipped_empty INTEGER NOT NULL DEFAULT 0 CHECK (skipped_empty >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE qum_raw_records (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  batch_id UUID NOT NULL REFERENCES qum_import_batches(id),
  artifact_id UUID NOT NULL REFERENCES qum_artifacts(id),
  source_locator TEXT NOT NULL,
  record_hash TEXT NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  raw_payload JSONB NOT NULL,
  parse_status TEXT NOT NULL CHECK (parse_status IN ('OK', 'ERROR', 'SKIPPED')),
  parse_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_id, source_locator)
);

CREATE TABLE qum_entities (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  schema_version_id UUID NOT NULL REFERENCES qum_schema_versions(id),
  entity_type TEXT NOT NULL,
  natural_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'VERIFIED', 'BLOCKED', 'SUPERSEDED', 'MIGRATED')),
  canonical_data JSONB NOT NULL,
  superseded_by_id UUID REFERENCES qum_entities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE qum_conflicts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  batch_id UUID REFERENCES qum_import_batches(id),
  conflict_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('BLOCKING', 'WARNING', 'INFO')),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'DEFERRED', 'UNRECONCILABLE')),
  candidate_entity_ids JSONB NOT NULL,
  evidence_refs JSONB NOT NULL,
  summary TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE qum_decisions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  conflict_id UUID NOT NULL REFERENCES qum_conflicts(id),
  action TEXT NOT NULL CHECK (action IN ('MERGE', 'KEEP_SEPARATE', 'OVERRIDE_FIELD', 'REJECT_RECORD', 'MARK_UNRECONCILABLE', 'DEFER')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('RULE', 'HUMAN')),
  actor_id TEXT NOT NULL,
  rationale TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  supersedes_decision_id UUID REFERENCES qum_decisions(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE qum_entity_relations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  from_entity_id UUID NOT NULL REFERENCES qum_entities(id),
  to_entity_id UUID NOT NULL REFERENCES qum_entities(id),
  relation_type TEXT NOT NULL,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('EXACT', 'RULE_VERIFIED', 'HUMAN_APPROVED')),
  decision_id UUID REFERENCES qum_decisions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_entity_id, to_entity_id, relation_type)
);

CREATE TABLE qum_provenance_entries (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  entity_id UUID NOT NULL REFERENCES qum_entities(id),
  field_path TEXT NOT NULL DEFAULT '*',
  raw_record_id UUID REFERENCES qum_raw_records(id),
  artifact_id UUID NOT NULL REFERENCES qum_artifacts(id),
  schema_version_id UUID NOT NULL REFERENCES qum_schema_versions(id),
  decision_id UUID REFERENCES qum_decisions(id),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('DIRECT_PARSE', 'RULE_TRANSFORM', 'HUMAN_DECISION', 'EXTERNAL_API', 'AI_EXTRACTION')),
  transformation_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE qum_execution_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  pipeline_id TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_json JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE qum_checkpoints (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES qum_execution_runs(id),
  step_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'WAITING_FOR_APPROVAL', 'FAILED')),
  input_hash TEXT NOT NULL,
  output_ref JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_id)
);
```

---

## 3. DDL de `@quimera/fiscal-outbox` (`fob_*`)

```sql
CREATE TABLE fob_fiscal_sequences (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  issuer_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production', 'mock')),
  branch CHAR(3) NOT NULL CHECK (branch ~ '^[0-9]{3}$'),
  terminal CHAR(5) NOT NULL CHECK (terminal ~ '^[0-9]{5}$'),
  doc_type CHAR(2) NOT NULL CHECK (doc_type ~ '^[0-9]{2}$'),
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0 AND last_number <= 9999999999),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issuer_id, environment, branch, terminal, doc_type)
);

CREATE TABLE fob_fiscal_intents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
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

CREATE TABLE fob_fiscal_documents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES qum_tenants(id),
  intent_id UUID NOT NULL UNIQUE REFERENCES fob_fiscal_intents(id),
  clave CHAR(50) NOT NULL UNIQUE CHECK (clave ~ '^[0-9]{50}$'),
  consecutivo CHAR(20) NOT NULL CHECK (consecutivo ~ '^[0-9]{20}$'),
  delivery_state TEXT NOT NULL CHECK (delivery_state IN (
    'FIRMADO', 'PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ALMACENADO', 'VENCIDO', 'INCIERTO'
  )),
  unsigned_xml_artifact_id UUID REFERENCES qum_artifacts(id),
  signed_xml_artifact_id UUID REFERENCES qum_artifacts(id),
  response_artifact_id UUID REFERENCES qum_artifacts(id),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_poll_at TIMESTAMPTZ,
  last_error_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. Estrategia de Índices

| Tabla | Índice | Propósito |
|---|---|---|
| `qum_raw_records` | `(tenant_id, record_hash)` | Detección rápida de duplicados exactos |
| `qum_entities` | `(tenant_id, entity_type, natural_key)` WHERE `status <> 'SUPERSEDED'` | Búsqueda de identidades activas |
| `qum_entities` | `GIN (canonical_data jsonb_path_ops)` | Consultas de atributos para reconciliación y auditoría |
| `qum_provenance_entries` | `(tenant_id, entity_id, field_path)` | Consulta rápida de linaje por registro (`QR-NFR-002`) |
| `qum_provenance_entries` | `(tenant_id, artifact_id)` | Análisis de impacto («¿qué entidades dependen de este archivo?») |
| `qum_conflicts` | `(tenant_id, status, severity)` | Listado inmediato de conflictos bloqueantes abiertos |
| `fob_fiscal_documents` | `(delivery_state, next_poll_at)` WHERE `delivery_state IN ('FIRMADO','PENDIENTE','ENVIADO')` | Polling eficiente con `FOR UPDATE SKIP LOCKED` |

---

## 5. Políticas de Aislamiento (RLS) y Eliminación

### 5.1. Row-Level Security (RLS)
En producción (y verificable en pruebas `T-SEC-001`), todas las tablas con `tenant_id` habilitan:

```sql
ALTER TABLE qum_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE qum_entities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_qum_entities ON qum_entities
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

El usuario aplicativo PostgreSQL nunca tiene atributo `BYPASSRLS` ni `SUPERUSER`.

### 5.2. Políticas de Eliminación
- **`ON DELETE RESTRICT` por defecto** en toda tabla de evidencia, linaje, decisiones y documentos fiscales. Se prohíbe `ON DELETE CASCADE` sobre tablas auditables para impedir borrado silencioso de evidencia.
- **Inmutabilidad por trigger (producción):** `qum_provenance_entries`, `qum_decisions` y `qum_artifacts` bloquean `UPDATE` y `DELETE` vía trigger o revocación de privilegios (`REVOKE UPDATE, DELETE`).
- **Retención fiscal CR:** Los registros `fob_*` y sus `qum_artifacts` XML asociados deben conservarse un mínimo de **5 años** conforme al marco tributario costarricense (ver `docs/07-security/privacy-and-data-handling.md`).
- **Anonimización / Derecho de supresión (Ley 8968):** Cuando un titular ejerza supresión legal no reñida con retención tributaria, se ejecuta *crypto-shredding* o seudonimización controlada en `ofi_customers`/`qum_entities` preservando el rastro de auditoría (`decision_id`).

---

## 6. Estrategia de Migraciones y Recuperación

- **Migraciones SQL:** Generadas y versionadas con `drizzle-kit` en carpetas separadas por módulo (`packages/core/drizzle`, `packages/fiscal-outbox/drizzle`, `apps/oficios/drizzle`) con tabla de control propia. Siempre hacia adelante (*forward-only*).
- **Recuperación tras fallos:**
  - `Data Exodus`: cada fase corre dentro de una transacción con checkpoint; un fallo revierte el lote parcial y permite reanudar desde el último checkpoint limpio.
  - `PostgreSQL PITR` (producción): `pg_basebackup` diario + archivado WAL continuo + verificación mensual de restauración en entorno de pruebas.
  - **Integridad CAS ↔ PostgreSQL:** Comando `quimera verify-artifacts` recalcula SHA-256 de archivos en CAS y alerta discrepancias o artefactos faltantes.
