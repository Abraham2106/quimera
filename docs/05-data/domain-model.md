# Modelo de Dominio — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [Glosario](../02-product/domain-glossary.md) | [ERD](./ERD.md) | [Diseño de Base de Datos](./database-design.md) | [ADR-005](../04-architecture/ADR/ADR-005-provenance-model.md) | [ADR-006](../04-architecture/ADR/ADR-006-conflict-reconciliation-model.md)

---

## 1. Principios del Modelo de Dominio

1. **Separación de planos de datos:**
   - **Plano de Evidencia e Ingestión (`qum_sources`, `qum_artifacts`, `qum_import_batches`, `qum_raw_records`):** datos crudos inmutables tal como llegaron de las fuentes.
   - **Plano Semántico y Reconciliación (`qum_entities`, `qum_entity_relations`, `qum_transformations`, `qum_conflicts`, `qum_decisions`):** reconstrucción, normalización, detección de ambigüedades y resoluciones auditables.
   - **Plano de Ejecución (`qum_execution_runs`, `qum_checkpoints`, `qum_schema_versions`):** trazabilidad operacional, reanudación e idempotencia.
   - **Plano Fiscal (`fob_fiscal_intents`, `fob_fiscal_documents`, `fob_fiscal_sequences`):** exclusivo de `@quimera/fiscal-outbox`.
   - **Plano de Aplicación Consumidora (`ofi_*`):** exclusivo de `apps/oficios` (nunca requerido por `@quimera/core` ni `@quimera/data-exodus`).
2. **Aislamiento multi-tenant obligatorio:** Toda entidad con datos de negocio incluye `tenant_id`.
3. **Unificación pragmática (anti-sobreingeniería):** Se evaluó si separar `SourceFile`, `EvidenceArtifact` y `Attachment` en tres tablas distintas. **Decisión:** unificar archivos importados, comprobantes XML crudos, acuses de Hacienda y fotografías de OficiOS bajo una sola entidad **`EvidenceArtifact`** (`qum_artifacts`) tipificada por `artifact_kind`, reduciendo complejidad y garantizando un único mecanismo CAS + SHA-256. Asimismo, **`Transformation`** y **`ProvenanceEdge`** se modelan de forma compacta (`qum_provenance_entries`) para no multiplicar joins innecesarios en consultas de linaje.

---

## 2. Catálogo de Entidades del Dominio

### 2.1. Núcleo de Datos y Migración (`Data Exodus` + `Core`)

| Entidad | Tabla física | Propósito | Mutabilidad |
|---|---|---|---|
| **Tenant** | `qum_tenants` | Unidad de aislamiento empresarial (PYME / contribuyente / proyecto). | Mutable (metadatos) |
| **DataSource** | `qum_data_sources` | Origen lógico registrado (ej. `clientes_excel`, `ventas_csv_2025`, `carpeta_xml_hacienda`). | Mutable (configuración) |
| **EvidenceArtifact** | `qum_artifacts` | Archivo binario/textual inmutable almacenado en CAS con `sha256`, `byte_size`, `mime_type`, `storage_uri` y `artifact_kind`. | **Inmutable** (append-only) |
| **ImportBatch** | `qum_import_batches` | Ejecución concreta de ingestión de una o más fuentes; contiene `idempotency_key`, `schema_version_id`, estado y contadores reconciliables (`total_raw`, `parsed_ok`, `parse_errors`). | Transiciones de estado controladas |
| **RawRecord** | `qum_raw_records` | Fila/nodo individual extraído tal cual desde un `EvidenceArtifact`, con `source_locator` (hoja/fila/xpath), `raw_payload` (JSONB) y `record_hash`. | **Inmutable** |
| **NormalizedEntity** | `qum_entities` | Entidad canónica reconstruida (`customer`, `invoice`, `payment`, `equipment`, `product`, `order`) con `entity_key`, `canonical_data` (JSONB), `schema_version_id` y `status` (`DRAFT`, `VERIFIED`, `BLOCKED`, `SUPERSEDED`). | Versionable / auditable |
| **EntityRelation** | `qum_entity_relations` | Vínculo explícito entre dos `NormalizedEntity` (ej. `invoice -> customer`, `payment -> invoice`) con `relation_type`, `confidence_level` (`EXACT`, `RULE_VERIFIED`, `HUMAN_APPROVED`) y `decision_id` opcional. **Prohibido crear relaciones desde inferencias no verificadas (`QR-DATA-006`).** | Auditable |
| **ProvenanceEntry** | `qum_provenance_entries` | Registro de linaje que enlaza una `NormalizedEntity` o campo específico hacia su(s) `RawRecord`, `EvidenceArtifact`, `transformation_rule`, `origin_kind`, `schema_version_id` y `decision_id`. | **Inmutable** (append-only) |
| **Conflict** | `qum_conflicts` | Contradicción, duplicado probable, referencia rota o anomalía detectada durante reconciliación, con `conflict_code`, `severity` (`BLOCKING`, `WARNING`, `INFO`), `candidate_entity_ids`, `evidence_refs` y estado (`OPEN`, `RESOLVED`, `DEFERRED`, `UNRECONCILABLE`). | Transiciones controladas |
| **ResolutionDecision** | `qum_decisions` | Decisión explícita que resuelve o difiere un `Conflict` (`MERGE`, `KEEP_SEPARATE`, `OVERRIDE_FIELD`, `REJECT_RECORD`, `MARK_UNRECONCILABLE`), con `actor_type` (`RULE`, `HUMAN`), `actor_id`, `rationale`, `evidence_snapshot` y timestamp. | **Inmutable** (append-only; una corrección crea una nueva decisión que referencia `supersedes_decision_id`) |
| **SchemaVersion** | `qum_schema_versions` | Registro de versiones de contratos y esquemas destino (`oficios-v1@1.0.0`, `exodus-canonical@1.0.0`) con su JSON Schema y checksum. | **Inmutable** |
| **ExecutionRun** | `qum_execution_runs` | Ejecución de un pipeline o comando (`pipeline_id`, `status`, `started_at`, `finished_at`, `metrics_json`, `error_json`). | Transiciones de estado |
| **Checkpoint** | `qum_checkpoints` | Instantánea de progreso por paso (`step_id`, `status`, `input_hash`, `output_ref`, `attempt_count`) que habilita reanudación sin reprocesar pasos completados. | Transiciones de estado |

### 2.2. Dominio Fiscal (`@quimera/fiscal-outbox`)

| Entidad | Tabla física | Propósito |
|---|---|---|
| **FiscalIntent** | `fob_fiscal_intents` | Intención de facturación vinculada a una operación comercial (`tenant_id`, `environment`, `operation_id`, `purpose`) con restricción `UNIQUE` para idempotencia. |
| **FiscalDocument** | `fob_fiscal_documents` | Implementación relacional de `StoredDocument` de `@dojocoding/hacienda-sdk/delivery` (`clave`, `estado`, `xml_artifact_id`, `signed_xml_artifact_id`, `response_artifact_id`, `lease_owner`, `lease_expires_at`, `attempts`, `next_poll_at`). |
| **FiscalSequence** | `fob_fiscal_sequences` | Contador atómico transaccional por `(tenant_id, issuer_id, environment, branch, terminal, doc_type)` para reservar consecutivos sin colisiones (`ADR-010`). |

### 2.3. Dominio Consumidor (`apps/oficios` — Aislado)

| Entidad | Tabla física | Propósito |
|---|---|---|
| **Customer** | `ofi_customers` | Cliente operativo de OficiOS con `provenance_entity_id` enlazando opcionalmente a `qum_entities`. |
| **Equipment** | `ofi_equipment` | Activo o equipo del cliente (ej. unidad minisplit HVAC con marca, modelo, BTU, refrigerante, serie). |
| **WorkOrder** | `ofi_work_orders` | Orden de servicio gobernada por `TradeContract` (`hvac-refrigeration-v1`) y FSM estricta (`RECEIVED -> DIAGNOSED -> QUOTED -> APPROVED -> IN_PROGRESS -> VERIFIED -> CLOSED`, más `CANCELLED`). |
| **WorkOrderEvent** | `ofi_work_order_events` | Bitácora inmutable de transiciones, mediciones técnicas, aprobaciones del cliente, materiales usados y enlaces a `qum_artifacts` / `fob_fiscal_intents`. |

---

## 3. Análisis de Simplificación y Unificación

| Pregunta de diseño | Decisión | Justificación |
|---|---|---|
| ¿Separar `Transformation` de `ProvenanceEntry`? | **Unificar en `ProvenanceEntry`** (con campos `transformation_id`, `rule_version`, `transform_params`) | Evita dos tablas casi 1:1 en MVP; si se requiere catálogo de reglas reutilizables post-MVP, `transformation_id` puede convertirse en FK a una tabla de reglas sin romper el linaje histórico. |
| ¿Separar `File` de `EvidenceArtifact`? | **Unificar en `EvidenceArtifact`** | Todos los insumos (CSV, XLSX, XML, fotos, acuses) comparten hash SHA-256, URI CAS, tamaño, MIME y retención inmutable. |
| ¿Separar `ExecutionResult` de `ExecutionRun` + `Checkpoint`? | **Incluir `result_summary` en `ExecutionRun` y `output_ref` en `Checkpoint`** | Reduce complejidad de consultas y mantiene 1 registro canónico por ejecución. |
| ¿Incluir `qum_entities` polimórficas o tablas por entidad (`customers`, `invoices`) en Data Exodus? | **`qum_entities` en staging semántico + carga a tablas tipadas del `TargetSchema` (ej. `ofi_customers`)** | Permite a `Data Exodus` reconciliar cualquier dominio de forma genérica y luego materializar datos limpios y tipados en PostgreSQL destino con FK al linaje. |

---

## 4. Invariantes de Dominio

1. **INV-01 (Sin dato huérfano):** Toda `NormalizedEntity` tiene al menos una `ProvenanceEntry` que apunta a un `RawRecord` y un `EvidenceArtifact` válidos (o a una captura manual explícita con `actor_id`).
2. **INV-02 (Sin fusión silenciosa):** Ningún par de entidades con `Conflict` de severidad `BLOCKING` puede fusionarse ni migrarse al destino sin una `ResolutionDecision` explícita.
3. **INV-03 (Conservación de conteo):** Para todo `ImportBatch` finalizado: `total_rows_seen === parsed_ok + parse_errors + skipped_empty`. Ninguna fila desaparece sin registro.
4. **INV-04 (Aislamiento estricto):** Toda relación (`EntityRelation`, `ProvenanceEntry`, `Conflict`, `FiscalIntent`) exige que origen y destino pertenezcan al mismo `tenant_id`.
5. **INV-05 (No sobre-escritura destructiva de historial):** `EvidenceArtifact`, `RawRecord`, `ProvenanceEntry` y `ResolutionDecision` son *append-only*. Las correcciones generan nuevas versiones o decisiones que referencian la anterior.
