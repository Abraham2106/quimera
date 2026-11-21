# Diagrama Entidad-Relación (ERD) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [Modelo de Dominio](./domain-model.md) | [Diseño de Base de Datos](./database-design.md)

---

## 1. ERD del Núcleo, Data Exodus y Pipelines (`qum_*`)

```mermaid
erDiagram
    qum_tenants ||--o{ qum_data_sources : "owns"
    qum_tenants ||--o{ qum_artifacts : "owns"
    qum_tenants ||--o{ qum_import_batches : "runs"
    qum_tenants ||--o{ qum_entities : "owns"
    qum_tenants ||--o{ qum_conflicts : "tracks"
    qum_tenants ||--o{ qum_execution_runs : "executes"

    qum_schema_versions ||--o{ qum_import_batches : "governs"
    qum_schema_versions ||--o{ qum_entities : "validates"
    qum_schema_versions ||--o{ qum_provenance_entries : "records"

    qum_data_sources ||--o{ qum_import_batches : "feeds"
    qum_artifacts ||--o{ qum_raw_records : "contains"
    qum_import_batches ||--o{ qum_raw_records : "ingests"

    qum_entities ||--o{ qum_provenance_entries : "derived_by"
    qum_raw_records ||--o{ qum_provenance_entries : "source_of"
    qum_artifacts ||--o{ qum_provenance_entries : "evidenced_by"

    qum_entities ||--o{ qum_entity_relations : "source_entity"
    qum_entities ||--o{ qum_entity_relations : "target_entity"

    qum_conflicts ||--o{ qum_decisions : "resolved_by"
    qum_decisions ||--o{ qum_provenance_entries : "justifies"
    qum_decisions ||--o{ qum_entity_relations : "authorizes"

    qum_execution_runs ||--o{ qum_checkpoints : "tracks"

    qum_tenants {
        uuid id PK
        text slug UK
        text display_name
        timestamptz created_at
    }

    qum_schema_versions {
        uuid id PK
        text schema_name
        text semver
        text sha256
        jsonb json_schema
        timestamptz created_at
    }

    qum_data_sources {
        uuid id PK
        uuid tenant_id FK
        text name
        text source_kind
        jsonb config_json
        timestamptz created_at
    }

    qum_artifacts {
        uuid id PK
        uuid tenant_id FK
        text sha256
        text artifact_kind
        text original_name
        text mime_type
        bigint byte_size
        text storage_uri
        timestamptz ingested_at
    }

    qum_import_batches {
        uuid id PK
        uuid tenant_id FK
        uuid source_id FK
        uuid schema_version_id FK
        text idempotency_key
        text status
        int total_rows_seen
        int parsed_ok
        int parse_errors
        timestamptz started_at
        timestamptz finished_at
    }

    qum_raw_records {
        uuid id PK
        uuid tenant_id FK
        uuid batch_id FK
        uuid artifact_id FK
        text source_locator
        text record_hash
        jsonb raw_payload
        text parse_status
        text parse_error
        timestamptz created_at
    }

    qum_entities {
        uuid id PK
        uuid tenant_id FK
        uuid schema_version_id FK
        text entity_type
        text natural_key
        text status
        jsonb canonical_data
        uuid superseded_by_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    qum_entity_relations {
        uuid id PK
        uuid tenant_id FK
        uuid from_entity_id FK
        uuid to_entity_id FK
        text relation_type
        text confidence_level
        uuid decision_id FK
        timestamptz created_at
    }

    qum_provenance_entries {
        uuid id PK
        uuid tenant_id FK
        uuid entity_id FK
        text field_path
        uuid raw_record_id FK
        uuid artifact_id FK
        uuid schema_version_id FK
        uuid decision_id FK
        text origin_kind
        text transformation_id
        text rule_version
        jsonb metadata_json
        timestamptz created_at
    }

    qum_conflicts {
        uuid id PK
        uuid tenant_id FK
        uuid batch_id FK
        text conflict_code
        text severity
        text status
        jsonb candidate_entity_ids
        jsonb evidence_refs
        text summary
        timestamptz detected_at
        timestamptz resolved_at
    }

    qum_decisions {
        uuid id PK
        uuid tenant_id FK
        uuid conflict_id FK
        text action
        text actor_type
        text actor_id
        text rationale
        jsonb payload_json
        uuid supersedes_decision_id FK
        timestamptz decided_at
    }

    qum_execution_runs {
        uuid id PK
        uuid tenant_id FK
        text pipeline_id
        text pipeline_version
        text status
        jsonb metrics_json
        jsonb error_json
        timestamptz started_at
        timestamptz finished_at
    }

    qum_checkpoints {
        uuid id PK
        uuid run_id FK
        text step_id
        text status
        text input_hash
        jsonb output_ref
        int attempt_count
        timestamptz updated_at
    }
```

---

## 2. ERD de Fiscal Outbox (`fob_*`) y OficiOS (`ofi_*`)

Las tablas `fob_*` y `ofi_*` son independientes del núcleo (`ADR-010`, `ADR-011`) y solo referencian hacia `qum_tenants`, `qum_artifacts` y `qum_entities` de forma opcional y unidireccional.

```mermaid
erDiagram
    qum_tenants ||--o{ fob_fiscal_sequences : "allocates"
    qum_tenants ||--o{ fob_fiscal_intents : "initiates"
    fob_fiscal_intents ||--o| fob_fiscal_documents : "produces"
    qum_artifacts ||--o{ fob_fiscal_documents : "stores_xml"

    qum_tenants ||--o{ ofi_customers : "serves"
    ofi_customers ||--o{ ofi_equipment : "owns"
    ofi_customers ||--o{ ofi_work_orders : "requests"
    ofi_equipment ||--o{ ofi_work_orders : "serviced_in"
    ofi_work_orders ||--o{ ofi_work_order_events : "records"
    qum_entities ||--o| ofi_customers : "migrated_from"
    fob_fiscal_intents ||--o| ofi_work_orders : "billed_by"

    fob_fiscal_sequences {
        uuid id PK
        uuid tenant_id FK
        text issuer_id
        text environment
        text branch
        text terminal
        text doc_type
        bigint last_number
        timestamptz updated_at
    }

    fob_fiscal_intents {
        uuid id PK
        uuid tenant_id FK
        text issuer_id
        text environment
        text operation_id
        text purpose
        text doc_type
        text status
        jsonb payload_snapshot
        timestamptz created_at
    }

    fob_fiscal_documents {
        uuid id PK
        uuid tenant_id FK
        uuid intent_id FK
        text clave UK
        text consecutivo
        text delivery_state
        uuid unsigned_xml_artifact_id FK
        uuid signed_xml_artifact_id FK
        uuid response_artifact_id FK
        text lease_owner
        timestamptz lease_expires_at
        int attempts
        timestamptz next_poll_at
        jsonb last_error_json
        timestamptz updated_at
    }

    ofi_customers {
        uuid id PK
        uuid tenant_id FK
        text legal_name
        text tax_id
        text phone
        text email
        uuid provenance_entity_id FK
        timestamptz created_at
    }

    ofi_equipment {
        uuid id PK
        uuid tenant_id FK
        uuid customer_id FK
        text trade_contract_id
        text serial_number
        jsonb specs_json
        uuid provenance_entity_id FK
        timestamptz created_at
    }

    ofi_work_orders {
        uuid id PK
        uuid tenant_id FK
        uuid customer_id FK
        uuid equipment_id FK
        text trade_contract_id
        text status
        bigint quote_amount_minor
        text currency_code
        boolean customer_authorized
        uuid fiscal_intent_id FK
        timestamptz created_at
        timestamptz closed_at
    }

    ofi_work_order_events {
        uuid id PK
        uuid tenant_id FK
        uuid work_order_id FK
        text event_type
        text from_status
        text to_status
        text actor_id
        jsonb payload_json
        uuid artifact_id FK
        timestamptz created_at
    }
```
