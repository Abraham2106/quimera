# Matriz de Pruebas por Componente y Requisito — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Alineado con `requirements-catalog.md` v1.0.0
- **Referencias:** [Estrategia de Pruebas](./test-strategy.md) | [RTM](../09-traceability/requirements-traceability-matrix.md)

---

## 1. Catálogo de Suites de Prueba (`T-*`)

| ID Prueba | Módulo | Tipo | Requisitos cubiertos | Descripción verificable |
|---|---|---|---|---|
| `T-CORE-001` | `@quimera/core` | Unit + Contract | `QR-CORE-001`, `QR-NFR-005` | Valida Zod schemas y JSON Schema Draft 2020-12 exportados para todos los tipos de Core. |
| `T-CORE-002` | `@quimera/core` | Isolation | `QR-CORE-002` | Verifica que `packages/core/package.json` no declara deps de runtime fuera de `zod` y pasa importación aislada. |
| `T-CORE-003` | Monorepo | Isolation | `QR-CORE-003`, `QR-NFR-009` | Instala cada `@quimera/*` en directorio limpio sin `OficiOS` ni `Clairic` y ejecuta smoke test (`exit 0`). |
| `T-CORE-004` | E2E | E2E Offline | `QR-CORE-004` | Ejecuta flujo baseline completo con red bloqueada y `QUIMERA_AI_ENABLED=false`; verifica 0 llamadas IA. |
| `T-CORE-005` | `@quimera/core` | Unit | `QR-CORE-005` | Verifica que todos los errores públicos cumplen `QuimeraErrorSchema`. |
| `T-CORE-006` | `@quimera/core` | Unit | `QR-CORE-006` | Valida aceptación de registros con metadatos mínimos y rechazo si falta `tenantId` o `schemaVersion`. |
| `T-CORE-007` | `@quimera/core` | Unit | `QR-CORE-007` | Verifica compatibilidad SemVer (`1.2.0 -> 1.3.0` válido; `1.x -> 2.0.0` rechazado). |
| `T-CORE-008` | `@quimera/core` | Property (`fast-check`) | `QR-CORE-008` | ≥200 casos aleatorios prueban determinismo de hashing canónico, normalizador CR y transiciones sin depender de orden de claves ni timezone. |
| `T-CORE-009` | `@quimera/core` | Property (`fast-check`) | `QR-CORE-009` | Sumas y restas monetarias a 5 decimales coinciden bit-a-bit con aritmética `BigInt` (`0` deriva float). |
| `T-CORE-010` | `@quimera/core` | Unit | `QR-CORE-010` | Ejecuta lógica de módulos inyectando puertos in-memory (`ArtifactStorePort`, `ClockPort`, `LoggerPort`) sin tocar disco ni red. |
| `T-DATA-001` | `@quimera/data-exodus` | Integration + Property | `QR-DATA-001`, `QR-DATA-003` | Importa CSVs con `,`, `;`, `\t`, UTF-8 BOM y Latin-1; verifica `total_source_rows == sum(terminal_states)` sin pérdida silenciosa. |
| `T-DATA-002` | `@quimera/data-exodus` | Integration | `QR-DATA-002`, `QR-DATA-004` | Importa XLSX multi-hoja con fechas Excel y fórmulas; verifica copia CAS idéntica byte-a-byte con `sha256` y `sheet!row`. |
| `T-DATA-003` | `@quimera/data-exodus` | Integration | `QR-DATA-005` | Importa XML FE 4.4 y FE 4.3 mediante `parseDocumentXml` de `hacienda-sdk`; verifica extracción exacta de clave, CAByS y totales. |
| `T-DATA-004` | `@quimera/data-exodus` | Integration | `QR-DATA-006` | Perfila dataset de 7 archivos y verifica detección ≥95% de columnas estándar CR (cédulas, claves, CAByS, monedas). |
| `T-DATA-005` | `@quimera/data-exodus` | Unit + Integration | `QR-DATA-006` | Genera propuesta `mapping.yaml` determinista con puntajes de confianza y marca columnas ambiguas `NEEDS_REVIEW`. |
| `T-DATA-006` | `@quimera/data-exodus` | Integration | `QR-DATA-007`, `QR-DATA-009` | Ejecuta reconciliación sobre `demo-hvac-1000`: detecta 40 duplicados probables, 12 facturas duplicadas, 7 pagos mal atribuidos, 3 cédulas contradictorias y 1 saldo irreconciliable sin fusionar ambiguos automáticamente. |
| `T-DATA-007` | `@quimera/data-exodus` | Integration | `QR-DATA-010` | Registra decisiones humanas, rechaza mutación/borrado directo de decisiones previas y valida enmienda con `supersedes_decision_id`. |
| `T-DATA-008` | `@quimera/data-exodus` | Idempotency | `QR-DATA-008` | Ejecuta importación dos veces sobre mismos archivos; segunda corrida reporta `inserted = 0` y estado de BD idéntico. |
| `T-DATA-011` | `@quimera/data-exodus` | Integration | `QR-DATA-011`, `QR-NFR-002` | Consulta procedencia de saldo/cliente migrado retornando archivos (`sha256`), locators, reglas y decisiones humanas. |
| `T-DATA-012` | `@quimera/data-exodus` | Failure Injection | `QR-DATA-012`, `QR-NFR-003`, `QR-NFR-004` | Interrumpe importación al 50%, valida hash intacto, ejecuta `resume` y comprueba estado idéntico a corrida continua. |
| `T-DATA-013` | `@quimera/data-exodus` | Integration | `QR-DATA-013`, `QR-NFR-011` | Prueba `--dry-run` (0 filas escritas), bloqueo ante conflicto `BLOCKING` abierto (`ERR_MIGRATION_BLOCKED_BY_CONFLICTS`) y carga exitosa con `ReconciliationReport`. |
| `T-DATA-014` | `@quimera/data-exodus` | Contract | `QR-DATA-014` | Registra importador JSON de ejemplo implementando `SourceImporterPort` sin modificar el motor. |
| `T-PASS-001` | `@quimera/cr-api-passport` | Contract | `QR-PASS-001`, `QR-NFR-005` | Valida todos los manifiestos YAML contra `ApiPassportSchema`. |
| `T-PASS-002` | `@quimera/cr-api-passport` | Contract (Offline) | `QR-PASS-002`, `QR-PASS-007` | Ejecuta los 3 pasaportes MVP (`taxpayer`, `cabys`, `fx/bccr-sdde`) en modo `fixture` 100% offline. |
| `T-PASS-003` | `@quimera/cr-api-passport` | Contract Drift | `QR-PASS-003` | Inyecta respuestas mutadas (campo requerido faltante, cambio de tipo, status inesperado) y verifica `ERR_PASSPORT_CONTRACT_DRIFT` con diff exacto. |
| `T-PASS-004` | `@quimera/cr-api-passport` | Concurrency / Rate Limit | `QR-PASS-004` | Dispara ráfaga de 100 llamadas y verifica tope ≤15 req/s + manejo de HTTP `429` respetando `Retry-After`. |
| `T-PASS-005` | `@quimera/cr-api-passport` | Unit + Integration | `QR-PASS-005` | Verifica caché TTL (`fromCache: true`, 0 llamadas HTTP en segunda consulta dentro de ventana). |
| `T-PASS-006` | `@quimera/cr-api-passport` | Unit | `QR-PASS-006` | Llama a `cr.bccr.sdde` sin `BCCR_SDDE_TOKEN` y comprueba fallo inmediato `ERR_AUTH_MISSING_CREDENTIALS` con 0 tráfico saliente. |
| `T-PASS-007` | `@quimera/cr-api-passport` | Contract | `QR-PASS-008`, `QR-NFR-006` | Valida fichas de SNIT (`public_ogc`) y Correos CR (`private_contract_required`) + smoke test MCP `stdio`. |
| `T-FCI-001` | `@quimera/factura-ci` | Integration | `QR-FCI-001` | Verifica los 7 modos de respuesta/fallo inyectables en simulador loopback (`201`, `rechazado`, `procesando`, `409`, `429`, `503`, timeout TCP post-POST). |
| `T-FCI-002` | `@quimera/factura-ci` | Concurrency | `QR-FCI-002` | Ejecuta escenario `FC-017` (≥10 solicitudes simultáneas): falla en `demo-pos-buggy` y pasa en `demo-pos-outbox`. |
| `T-FCI-003` | `@quimera/factura-ci` | Failure Injection | `QR-FCI-003` | Ejecuta escenario `FC-031` (timeout post-POST): falla en `demo-pos-buggy` (doble clave) y pasa en `demo-pos-outbox` (reconciliación `GET` misma clave). |
| `T-FCI-004` | `@quimera/factura-ci` | Idempotency | `QR-FCI-004` | Reenvía mismo `operationId` 5 veces y comprueba exactamente 1 envío en simulador. |
| `T-FCI-005` | `@quimera/factura-ci` | Behavioral | `QR-FCI-005` | Valida que SUT distingue `PENDIENTE`/`PROCESANDO`/`ENVIADO` vs `ACEPTADO` y `ERROR` técnico vs `RECHAZADO`. |
| `T-FCI-006` | `@quimera/factura-ci` | Security / Isolation | `QR-FCI-006`, `QR-SEC-001` | Escenarios `FC-020..022` validan cero mezcla de credenciales, documentos o consecutivos entre `tenant-A` y `tenant-B`. |
| `T-FCI-007` | `@quimera/factura-ci` | Crash-Recovery | `QR-FCI-007`, `QR-NFR-004` | Reinicia SUT con comprobante `PENDIENTE` y comprueba reconciliación + rechazo de mutación sobre factura `ACEPTADO`. |
| `T-FCI-008` | `@quimera/factura-ci` | Contract / CLI | `QR-FCI-008`, `QR-NFR-007` | Verifica salidas terminal, JSON (con `disclaimer` obligatorio), JUnit XML y exit codes `0/1/2`. |
| `T-OUT-001` | `@quimera/fiscal-outbox` | Integration | `QR-OUT-001` | Prueba `PgDocumentStore` contra interfaz `DocumentStore` y matriz `VALID_TRANSITIONS` de `hacienda-sdk`. |
| `T-OUT-002` | `@quimera/fiscal-outbox` | Concurrency | `QR-OUT-002` | 20 inserciones simultáneas con misma tupla `(tenant_id, environment, operation_id, purpose)` generan exactamente 1 `FiscalIntent`. |
| `T-OUT-003` | `@quimera/fiscal-outbox` | Concurrency | `QR-OUT-003` | 50 reservas concurrentes desde 2 procesos sobre mismo `issuer_id` generan consecutivos estrictamente monotónicos sin colisiones ni huecos. |
| `T-OUT-004` | `@quimera/fiscal-outbox` | Concurrency / Crash | `QR-OUT-004` | 2 workers concurrentes con `SKIP LOCKED` nunca toman el mismo documento; lease expirado es retomado por segundo worker. |
| `T-OUT-005` | `@quimera/fiscal-outbox` | Failure Injection | `QR-OUT-005` | Fallo inyectado tras `POST` dispara solo consultas `GET` por la clave original, cero segundos `POST`. |
| `T-OUT-006` | `@quimera/fiscal-outbox` | Integration | `QR-OUT-006` | Mutar el pedido comercial posterior al encolado no altera el XML firmado ni snapshot almacenados en el outbox. |
| `T-OUT-007` | `@quimera/fiscal-outbox` | Isolation | `QR-OUT-007` | Verifica que el núcleo de `Fiscal Outbox` opera con `OutboxSchedulerPort` local sin importar SDK de Cloudflare/Redis. |
| `T-PIPE-001` | `@quimera/pipeline` | Unit | `QR-PIPE-001` | Rechaza DAG con ciclo o dependencia inexistente antes de ejecutar el paso 1 (`ERR_PIPELINE_INVALID_DAG`). |
| `T-PIPE-002` | `@quimera/pipeline` | Contract | `QR-PIPE-002` | Rechaza conexión de pasos con `outputContract`/`inputContract` incompatibles (`ERR_PIPELINE_CONTRACT_MISMATCH`). |
| `T-PIPE-003` | `@quimera/pipeline` | Integration | `QR-PIPE-003` | Comprueba persistencia de `execution_runs` y `checkpoints` tras cada paso completado en PostgreSQL. |
| `T-PIPE-004` | `@quimera/pipeline` | Crash-Recovery | `QR-PIPE-004`, `QR-NFR-004` | Corta corrida tras paso 2/4 y ejecuta `resume`; solo corren pasos 3 y 4 con resultado final idéntico. |
| `T-PIPE-005` | `@quimera/pipeline` | Unit | `QR-PIPE-005` | Paso `idempotent: false` con error transitorio NO reintenta automáticamente; paso `idempotent: true` sí reintenta con backoff. |
| `T-PIPE-006` | `@quimera/pipeline` | Integration | `QR-PIPE-006` | Compuerta `human_review` pausa corrida en `WAITING_FOR_APPROVAL` (exit code `3`) y reanuda hasta `COMPLETED` tras resolver conflictos. |
| `T-PIPE-007` | `@quimera/pipeline` | Integration | `QR-PIPE-007` | Fallo controlado invoca compensación declarada y registra su resultado auditable en `execution_runs`. |
| `T-OFI-001` | `apps/oficios` | Static Boundary | `QR-OFI-001`, `QR-NFR-010` | Regla ESLint/grafo confirma `0` imports desde `packages/*` hacia `apps/oficios`. |
| `T-OFI-002` | `apps/oficios` | Integration | `QR-OFI-002`, `QR-OFI-003` | Recorre FSM `hvac-refrigeration-v1` y verifica HTTP `409` (`ERR_WORK_ORDER_APPROVAL_REQUIRED`) al intentar cerrar o intervenir sin aprobación del cliente. |
| `T-OFI-003` | `apps/oficios` | E2E | `QR-OFI-004` | Consulta cliente migrado por `Data Exodus` y comprueba exposición de `provenance` (archivo, fila, decisión). |
| `T-OFI-004` | `apps/oficios` | Integration | `QR-OFI-005` | Registra diagnóstico con foto (`sha256`) y materiales con código CAByS validado vía `CR API Passport`. |
| `T-OFI-005` | `apps/oficios` | Integration | `QR-OFI-006` | Cerrar orden encola exactamente 1 `FiscalIntent` en `Fiscal Outbox`; repetir cierre es idempotente. |
| `T-OFI-006` | `apps/oficios` | Isolation | `QR-OFI-007` | Ciclo completo de aprobación y cierre funciona sin credenciales ni dependencia de WhatsApp Adapter. |
| `T-CLAI-001` | `@quimera/adapter-clairic` | Isolation | `QR-CLAI-001` | Suite completa del monorepo corre en verde sin `@quimera/adapter-clairic` instalado. |
| `T-CLAI-002` | `@quimera/adapter-clairic` | Unit (Stub) | `QR-CLAI-002`, `QR-CLAI-003` | Valida rechazo local de >4 imágenes / >8 MiB / URL remota y creación automática de `Conflict(AI_LOW_CONFIDENCE)` si `confidence < 0.90`. |
| `T-SEC-001`..`012` | Transversal | Security | `QR-SEC-001`..`012` | Suite dedicada de seguridad verificando 1:1 cada control de `security-requirements.md` (RLS/tenant, redacción secretos, XXE/zip-bomb/CSV-injection, prompt injection, append-only, integridad CAS, `.p12` expirado, RBAC, PII fixtures, retención 5 años, lockfile/audit, loopback-only). |
| `T-NFR-BENCH` | Transversal | Performance / Compat | `QR-NFR-001`, `QR-NFR-002`, `QR-NFR-008`, `QR-NFR-012` | Benchmark de 1.000 registros (≤5s), consulta de procedencia sobre 100k filas (≤150 ms), instalación limpia en CI (≤5 min) y prueba de lectura N-1. |
