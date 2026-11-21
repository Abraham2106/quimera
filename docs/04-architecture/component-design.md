# Diseño Detallado de Componentes y Límites entre Módulos — QUIMERA

- **Documento:** `docs/04-architecture/component-design.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Aprobado para especificación de interfaces e implementación

---

## 1. Matriz de dependencias permitidas y prohibidas

| Módulo | Dependencias internas permitidas | Dependencias externas principales | Dependencias PROHIBIDAS |
|---|---|---|---|
| `@quimera/core` | Ninguna | `zod` | PostgreSQL, HTTP servers, `hacienda-sdk`, `whatsapp-sdk`, `adapter-clairic`, `oficios` |
| `@quimera/data-exodus` | `@quimera/core` | `drizzle-orm`, `pg`, `csv-parse`, `exceljs`, `@dojocoding/hacienda-sdk` (solo parser XML) | `oficios`, `factura-ci`, `fiscal-outbox`, `adapter-clairic` (import estático), `whatsapp-sdk` |
| `@quimera/cr-api-passport` | `@quimera/core` | `zod`, `yaml`, `@modelcontextprotocol/sdk` (opcional CLI/MCP) | PostgreSQL obligatorio, `data-exodus`, `oficios`, `factura-ci`, `adapter-clairic` |
| `@quimera/fiscal-outbox` | `@quimera/core` | `@dojocoding/hacienda-sdk`, `drizzle-orm`, `pg` | `data-exodus`, `oficios`, `factura-ci`, `adapter-clairic`, Cloudflare SDK en core |
| `@quimera/factura-ci` | `@quimera/core` | `@dojocoding/hacienda-sdk` (solo validadores/tipos), `hono` (simulador loopback), `fast-check` | `data-exodus`, `oficios`, `adapter-clairic`, credenciales reales Hacienda |
| `@quimera/pipeline` | `@quimera/core` | `yaml`, `drizzle-orm`/`pg` (adaptador opcional de checkpoints) | `oficios`, `adapter-clairic`, acoplamiento directo a implementación de pasos específicos |
| `@quimera/adapter-clairic` | `@quimera/core` | `zod` (HTTP fetch nativo Node 22) | `oficios`, `fiscal-outbox`, `factura-ci`, dependencias CUDA nativas en Node |
| `apps/oficios` | `@quimera/core`, `@quimera/cr-api-passport`, `@quimera/fiscal-outbox` (opcional/inyección), lectura de esquema destino PG | `hono`, `drizzle-orm`, `pg`, `@dojocoding/whatsapp-sdk` (opcional post-MVP) | Ser importada por cualquier paquete en `packages/*` |

---

## 2. Especificación por componente

### 2.1. QUIMERA Core (`@quimera/core`)
- **Responsabilidad:** Fuente única de verdad para contratos transversales, identidades UUIDv7, dinero decimal exacto (`MoneyExact`), sobres de error (`QuimeraError`), procedencia, conflictos, resultados de ejecución y puertos hexagonales.
- **Capacidades públicas:** Esquemas Zod, generador de JSON Schema, utilidades de hash canónico SHA-256 (RFC 8785 / JSON canónico determinista), normalizadores de identificaciones CR, validación de SemVer y contratos de puertos.
- **Contratos E/S:** Tipos puros y esquemas JSON Schema Draft 2020-12.
- **Errores:** Taxonomía base (`VALIDATION`, `CONFLICT`, `AUTH`, `EXTERNAL_API`, `INTEGRITY`, `STATE_TRANSITION`, `INFRASTRUCTURE`, `NOT_FOUND`).
- **Estados:** Sin estado persistente (stateless).
- **Persistencia:** Ninguna.
- **Seguridad:** Redacción centralizada de secretos (`redactSensitiveFields`) reutilizable por todos los módulos.
- **Versionado:** SemVer sincronizado en `MAJOR` para contratos core; cambios aditivos solo en `MINOR`.
- **Independencia operativa:** 100% autónomo.

### 2.2. Data Exodus (`@quimera/data-exodus`)
- **Responsabilidad:** Ingestión inmutable multi-formato (CSV, XLSX, XML FE 4.4), perfilado estructural, propuesta de correspondencias, normalización, detección de duplicados/contradicciones, gestión de decisiones humanas auditables, carga transaccional a PostgreSQL y consultas de procedencia.
- **Capacidades públicas:** `ingest()`, `profile()`, `proposeMapping()`, `normalizeAndReconcile()`, `listConflicts()`, `resolveConflict()`, `migrateToPostgres()`, `getEntityProvenance()`, `generateReconciliationReport()`.
- **Contratos de entrada:** `IngestRequest` (archivos + `tenantId` + `projectId`), `MappingManifest`, `ResolutionDecisionInput`, `MigrationOptions`.
- **Contratos de salida:** `ImportBatchSummary`, `SchemaProfile`, `MappingProposal`, `ConflictList`, `ReconciliationReport`, `ProvenanceChain`.
- **Errores:** `ERR_IO_*`, `ERR_PARSE_*`, `ERR_SEC_XXE_REJECTED`, `ERR_ARTIFACT_HASH_MISMATCH`, `ERR_CONFLICT_ALREADY_RESOLVED`, `ERR_MIGRATION_BLOCKED_BY_CONFLICTS`.
- **Estados:**
  - `ImportBatch`: `PENDING → RUNNING → COMPLETED | INTERRUPTED | FAILED`
  - `Conflict`: `OPEN → RESOLVED | QUARANTINED` (decisiones posteriores enlazan vía `SUPERSEDES`)
- **Persistencia:** `ArtifactStorePort` (local CAS SHA-256 en MVP; S3/R2 en prod) + PostgreSQL (`source_artifacts`, `import_batches`, `raw_records`, `normalized_entities`, `entity_relations`, `conflicts`, `resolution_decisions`, `provenance_entries`, `reconciliation_reports`).
- **Seguridad:** Anti-XXE, límites anti-zip-bomb, sanitización CSV al exportar, verificación SHA-256 al leer, aislamiento por `tenantId`.
- **Versionado:** SemVer propio + `schema_versions` para migraciones de esquemas destino.
- **Independencia operativa:** Ejecutable vía CLI o SDK con solo `@quimera/core` + PostgreSQL.

### 2.3. CR API Passport (`@quimera/cr-api-passport`)
- **Responsabilidad:** Catálogo técnico verificable de APIs costarricenses, clientes tipados con caché/rate-limit, verificación de deriva contractual y modo offline por fixtures.
- **Capacidades públicas:** `listPassports()`, `getPassport(id)`, `call(passportId, operation, params, opts)`, `verifyPassport(passportId, opts)`, `generateClientSnippet(passportId, lang)`.
- **Contratos de entrada:** `PassportCallRequest`, `VerifyOptions` (`mode: "fixture" | "live"`), credenciales vía `CredentialProviderPort` (env vars).
- **Contratos de salida:** `PassportResponse<T>` (`data`, `meta: { fetchedAt, fromCache, stale, passportVersion, driftWarnings }`), `ContractVerificationReport`.
- **Errores:** `ERR_PASSPORT_NOT_FOUND`, `ERR_AUTH_MISSING_CREDENTIALS`, `ERR_PASSPORT_RATE_LIMITED`, `ERR_PASSPORT_CONTRACT_DRIFT`, `ERR_UPSTREAM_UNAVAILABLE`.
- **Estados:** Caché local (memoria o archivo/SQLite ligero opcional) y estado en memoria de ventana deslizante del `RateLimiter`.
- **Persistencia:** No exige PostgreSQL; caché opcional configurable por `CachePort`.
- **Seguridad:** Nunca registra tokens Bearer (`BCCR_SDDE_TOKEN`) en logs ni caché; valida parámetros antes de llamar para evitar consultas abusivas `400` hacia Hacienda.
- **Versionado:** SemVer para el paquete + campo independiente `passportRevision` y `verifiedAt` en cada manifiesto YAML/JSON.
- **Independencia operativa:** 100% independiente sin BD ni otros módulos.

### 2.4. Fiscal Outbox (`@quimera/fiscal-outbox`)
- **Responsabilidad:** Ejecución durable y recuperación de operaciones fiscales sobre `@dojocoding/hacienda-sdk/delivery`, agregando idempotencia por operación comercial, reserva atómica de consecutivos por `issuerId`, persistencia multi-proceso en PostgreSQL y reconciliación de estados inciertos.
- **Capacidades públicas:** `enqueueIntent(input)`, `reserveSequence(issuerScope)`, `processPendingBatch(workerId)`, `reconcileAmbiguous(clave)`, `getIntentStatus(tenantId, operationId)`, `PgDocumentStore` (compatible con `DocumentStore` del SDK).
- **Contratos de entrada:** `EnqueueFiscalIntentInput` (`tenantId`, `issuerId`, `environment`, `operationId`, `purpose`, `documentType`, `branch`, `pos`, `payload`).
- **Contratos de salida:** `FiscalIntentRecord`, `FiscalAttemptRecord`, `OutboxWorkerBatchResult`.
- **Errores:** `ERR_FISCAL_DUPLICATE_INTENT`, `ERR_FISCAL_INVALID_TRANSITION`, `ERR_FISCAL_SEQUENCE_OVERFLOW`, `ERR_FISCAL_AMBIGUOUS_DELIVERY`, `ERR_FISCAL_CERT_EXPIRED`.
- **Estados:**
  - `FiscalIntent`: `ENQUEUED → SEQUENCE_RESERVED → SIGNED → SUBMITTING → SUBMITTED_PENDING | AMBIGUOUS_RECONCILING → ACCEPTED | REJECTED | EXPIRED | MANUAL_INTERVENTION`
  - Mapeo explícito 1-a-1 con `DeliveryState` de `hacienda-sdk` (`FIRMADO`, `PENDIENTE`, `ENVIADO`, `ACEPTADO`, `RECHAZADO`, `ALMACENADO`, `VENCIDO`).
- **Persistencia:** PostgreSQL (`fiscal_intents`, `fiscal_sequences`, `fiscal_documents`, `fiscal_attempts`, `fiscal_status_polls`).
- **Seguridad:** Credenciales IDP y `.p12` resueltas por `(tenantId, issuerId, environment)` desde `SecretProviderPort` sin compartición de `TokenManager` entre emisores; sin secretos en tablas ni logs.
- **Versionado:** SemVer + compatibilidad fijada en rango con `@dojocoding/hacienda-sdk` (`^0.13.0`).
- **Independencia operativa:** Instalable en cualquier backend Node 22 + PostgreSQL sin Data Exodus ni OficiOS.

### 2.5. Factura CI (`@quimera/factura-ci`)
- **Responsabilidad:** Verificación automatizada de invariantes conductuales de aplicaciones de facturación electrónica (SUT) mediante simulador determinista local de Hacienda e inyección de fallos.
- **Capacidades públicas:** `startMockHacienda(config)`, `runSuite(targetConfig, suiteOptions)`, CLI `quimera factura-ci run`, reporteros (`console`, `json`, `junit`).
- **Contratos de entrada:** `FacturaCiConfig` (URL loopback de la SUT, adaptador de operaciones de prueba, escenarios seleccionados, semilla determinista para `fast-check`).
- **Contratos de salida:** `FacturaCiReport` (conteos por familia, detalles `FC-xxx`, evidencia de tráfico capturado en simulador, exit code `0|1|2`, aviso legal no-certificación).
- **Errores:** `ERR_SUT_UNREACHABLE`, `ERR_SEC_LOOPBACK_ONLY`, `ERR_SUITE_EXECUTION_TIMEOUT`.
- **Estados:** Estado en memoria del simulador por corrida (aislado y limpiado entre escenarios).
- **Persistencia:** Solo exportación opcional de reportes JSON/JUnit en disco.
- **Seguridad:** Restricción estricta a interfaces loopback (`127.0.0.1`/`::1`), bloqueo de redirecciones HTTP, rechazo de credenciales o cédulas reales.
- **Versionado:** SemVer + identificadores estables de escenarios (`FC-001`..`FC-024`) que nunca se reasignan a otro significado.
- **Independencia operativa:** 100% independiente; puede probar cualquier app fiscal externa (incluso escrita en Python/Go/PHP si expone el contrato HTTP de pruebas).

### 2.6. QUIMERA Pipeline (`@quimera/pipeline`)
- **Responsabilidad:** Composición declarativa de pasos en DAG acíclico, validación estática de contratos, ejecución con checkpoints, compuertas humanas y reanudación determinista.
- **Capacidades públicas:** `parsePipeline(yaml)`, `validateDagAndContracts(def, registry)`, `runPipeline(def, ctx)`, `resumePipeline(runId)`, `cancelPipeline(runId)`.
- **Contratos de entrada:** `PipelineDefinition` (YAML/JSON), `StepRegistry`, `RunContext`.
- **Contratos de salida:** `ExecutionRunRecord`, `StepCheckpointRecord[]`, `ExecutionResult`.
- **Errores:** `ERR_PIPELINE_INVALID_DAG`, `ERR_PIPELINE_CONTRACT_MISMATCH`, `ERR_PIPELINE_NON_IDEMPOTENT_RETRY`, `ERR_PIPELINE_WAITING_APPROVAL`.
- **Estados:** `PENDING → RUNNING → WAITING_FOR_APPROVAL | COMPLETED | INTERRUPTED | FAILED | CANCELLED`.
- **Persistencia:** Puerto `CheckpointStorePort` (PostgreSQL en producción/MVP; in-memory para pruebas unitarias).
- **Seguridad:** No ejecuta shell arbitrario ni evalúa código dinámico desde manifiestos YAML; solo invoca `stepId` previamente registrados en `StepRegistry`.
- **Versionado:** SemVer + `pipelineSpecVersion: "1.0"`.
- **Independencia operativa:** Solo depende de `@quimera/core`.

### 2.7. OficiOS (`apps/oficios`)
- **Responsabilidad:** Aplicación demostrativa y vertical operativa para servicios de **Refrigeración y Aire Acondicionado (`hvac-refrigeration-v1`)**, consumidora del toolkit.
- **Capacidades públicas:** API REST (`/api/v1/customers`, `/api/v1/equipment`, `/api/v1/work-orders`, `/api/v1/work-orders/:id/transition`, `/api/v1/provenance/:entityType/:id`) + UI web mínima responsiva.
- **Estados de `WorkOrder`:** `RECEIVED → DIAGNOSED → QUOTED → APPROVED → IN_PROGRESS → VERIFIED → CLOSED` (+ `CANCELLED` desde estados anteriores a `CLOSED`).
- **Persistencia:** Tablas operativas en PostgreSQL (`customers`, `equipment`, `work_orders`, `work_order_transitions`, `work_order_materials`, `work_order_approvals`, `work_order_evidences`) compartiendo lectura de vistas de procedencia de `Data Exodus`.
- **Seguridad:** Auth con contexto de `tenantId` y roles (`ADMIN`, `OPERATOR`, `AUDITOR_READONLY`), validación de adjuntos por tipo MIME y tamaño + hash SHA-256.
- **Independencia operativa:** Consumidor puro; puede eliminarse del repositorio sin romper ningún test de `packages/*`.

### 2.8. Clairic Adapter (`@quimera/adapter-clairic` — Opcional)
- **Responsabilidad:** Implementar `StructuredExtractorPort` sobre Cloudflare Workers AI (`@cf/cloudflare/clairic` / `clairic-flash`) o endpoint HTTP local compatible con el modelo open-weight Apache 2.0.
- **Contratos E/S:** `ExtractionRequest { state, images?, documents?, fields, referenceDate? }` → `ExtractionResponse { model, answers, truncated, usage }`.
- **Errores:** `ERR_CLAIRIC_PAYLOAD_LIMIT`, `ERR_CLAIRIC_UPSTREAM_TIMEOUT`, `ERR_CLAIRIC_SCHEMA_VIOLATION`.
- **Persistencia:** Ninguna propia.
- **Seguridad:** Sin URLs remotas permitidas, límite estricto 4 imágenes/8 MiB, contención de prompt injection, Zero Data Retention en Workers AI, revisión humana obligatoria cuando `confidence < 0.90` o en campos fiscales/financieros.
- **Independencia operativa:** 100% opcional; no requerido en instalación ni pruebas baseline.
