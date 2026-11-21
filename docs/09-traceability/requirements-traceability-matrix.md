# Matriz de Trazabilidad de Requisitos (RTM) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Cobertura completa (89 / 89 requisitos trazados; 0 requisitos `Must` sin prueba)
- **Referencias:** [Visión de Producto](../02-product/product-vision.md) | [Catálogo de Requisitos](../03-requirements/requirements-catalog.md) | [Matriz de Pruebas](../08-quality/test-matrix.md) | [Pruebas de Aceptación](../08-quality/acceptance-tests.md)

---

## 1. Verificación de Cobertura (Resumen)

| Dominio | Total Requisitos | `Must` | `Should` | `Could` | Con Prueba Asignada | Huérfanos |
|---|---|---|---|---|---|---|
| `QR-CORE` | 10 | 10 | 0 | 0 | 10 / 10 | 0 |
| `QR-DATA` | 14 | 13 | 0 | 1 | 14 / 14 | 0 |
| `QR-PASS` | 8 | 7 | 0 | 1 | 8 / 8 | 0 |
| `QR-FCI` | 8 | 8 | 0 | 0 | 8 / 8 | 0 |
| `QR-OUT` | 7 | 4 | 2 | 1 | 7 / 7 | 0 |
| `QR-PIPE` | 7 | 6 | 1 | 0 | 7 / 7 | 0 |
| `QR-OFI` | 7 | 5 | 1 | 1 | 7 / 7 | 0 |
| `QR-CLAI` | 4 | 1* | 0 | 3 | 4 / 4 | 0 |
| `QR-NFR` | 12 | 7 | 5 | 0 | 12 / 12 | 0 |
| `QR-SEC` | 12 | 9 | 1 | 2 | 12 / 12 | 0 |
| **TOTAL** | **89** | **70** | **10** | **9** | **89 / 89 (100%)** | **0** |

*\* `QR-CLAI-001` es `Must` en su parte de aislamiento (no dependencia en Core/MVP) y `Could` en su implementación runtime live.*

---

## 2. Matriz Completa: Necesidad → Objetivo → Requisito → Componente → Contrato → Prueba → Aceptación → Demo

### 2.1. QUIMERA Core (`QR-CORE-001`..`010`)

| Necesidad del usuario | Objetivo | Requisito | Prioridad | Componente | Contrato | Prueba | Criterio de aceptación | Demo |
|---|---|---|---|---|---|---|---|---|
| Intercambiar datos con tipos comunes entre módulos | `OBJ-01` | `QR-CORE-001` | Must | `@quimera/core` | `core-contracts.schema.json` | `T-CORE-001` | 100% esquemas Zod y JSON Schema 2020-12 válidos | Slice 1 |
| Usar Core sin arrastrar BD ni servidores | `OBJ-01` | `QR-CORE-002` | Must | `@quimera/core` | `package.json` Core | `T-CORE-002`, `AT-13` | Cero deps runtime fuera de `zod` | Slice 1 |
| Instalar módulos por separado sin OficiOS/Clairic | `OBJ-01` | `QR-CORE-003` | Must | Todos `packages/*` | `ModuleCapabilities` | `T-CORE-003`, `AT-13` | Smoke test aislado pasa con `exit 0` | Demo Aislamiento |
| Operar sin modelos de IA ni GPU | `OBJ-01` | `QR-CORE-004` | Must | Core / Baseline | `requiresAi: false` | `T-CORE-004`, `AT-17` | Flujo E2E offline con 0 llamadas IA | Demo Offline |
| Diagnosticar errores uniformemente en CLI/agentes | `OBJ-01` | `QR-CORE-005` | Must | `@quimera/core` | `QuimeraError` | `T-CORE-005` | 100% errores públicos validan `QuimeraErrorSchema` | Demo E2E |
| Mantener metadatos ligeros en módulos pequeños | `OBJ-01` | `QR-CORE-006` | Must | `@quimera/core` | `QuimeraEnvelope` | `T-CORE-006` | Acepta registros mínimos; exige `tenantId` y `schemaVersion` | Slice 1 |
| Detectar rupturas entre versiones de módulos | `OBJ-01` | `QR-CORE-007` | Must | `@quimera/core` | `contractVersion` (SemVer) | `T-CORE-007` | Acepta `1.2→1.3`; rechaza `1.x→2.0` | Slice 1 |
| Reproducir resultados bit-a-bit en cualquier máquina | `OBJ-02` | `QR-CORE-008` | Must | `@quimera/core` | Normalizadores / Hash | `T-CORE-008` | ≥200 property tests deterministas en verde | Slice 1 |
| Evitar errores de centavos en sumas contables/fiscales | `OBJ-02` | `QR-CORE-009` | Must | `@quimera/core` | Dinero exacto (`BigInt`/ISO 4217) | `T-CORE-009` | 0 deriva de punto flotante a 5 decimales | Slice 1 |
| Probar módulos en memoria sin disco ni red | `OBJ-01` | `QR-CORE-010` | Must | `@quimera/core` | `ArtifactStorePort`, `StructuredExtractorPort`, `ClockPort` | `T-CORE-010` | Tests unitarios corren 100% in-memory | Slice 1 |

### 2.2. Data Exodus (`QR-DATA-001`..`014`)

| Necesidad del usuario | Objetivo | Requisito | Prioridad | Componente | Contrato | Prueba | Criterio de aceptación | Demo |
|---|---|---|---|---|---|---|---|---|
| No perder registros silenciosamente en una migración | `OBJ-02` | `QR-DATA-001` | Must | `@quimera/data-exodus` | `ImportBatch` | `T-DATA-001`, `AT-01` | `total_source_rows == sum(terminal_states)` | Demo Exodus |
| Conservar copia original verificable de cada archivo | `OBJ-02` | `QR-DATA-002` | Must | `@quimera/data-exodus` | `EvidenceArtifact` (CAS SHA-256) | `T-DATA-002`, `AT-01`, `AT-02` | Archivo CAS idéntico byte-a-byte con `sha256` | Demo Exodus |
| Importar CSVs exportados desde Excel CR (`;`, Latin-1) | `OBJ-02` | `QR-DATA-003` | Must | `@quimera/data-exodus` | `SourceImporterPort` (CSV) | `T-DATA-001`, `AT-01` | 100% tildes íntegras y `rowNumber` exacto | Demo Exodus |
| Importar libros Excel multi-hoja sin perder coordenadas | `OBJ-02` | `QR-DATA-004` | Must | `@quimera/data-exodus` | `SourceImporterPort` (XLSX) | `T-DATA-002`, `AT-02` | `{ sheet, rowNumber }` trazado; fechas ISO-8601 | Demo Exodus |
| Interpretar comprobantes fiscales XML FE 4.4 reales | `OBJ-02` | `QR-DATA-005` | Must | `@quimera/data-exodus` | `parseDocumentXml` (`hacienda-sdk`) | `T-DATA-003`, `AT-03` | Extrae clave 50 dígitos, CAByS y totales sin duplicar parser | Demo Exodus |
| Reconstruir esquemas desde archivos sucios sin caja negra | `OBJ-02` | `QR-DATA-006` | Must | `@quimera/data-exodus` | `SchemaProfile` / `mapping.yaml` | `T-DATA-004`, `T-DATA-005`, `AT-04`, `AT-05` | ≥95% columnas estándar CR detectadas; ambiguas `NEEDS_REVIEW` | Demo Exodus |
| Descubrir duplicados, contradicciones y saldos rotos | `OBJ-02` | `QR-DATA-007` | Must | `@quimera/data-exodus` | `Conflict` (10 códigos) | `T-DATA-006`, `AT-06` | 100% de anomalías sembradas en `demo-hvac-1000` (40+12+7+3+1) | Demo Exodus |
| Evitar duplicados al repetir importaciones | `OBJ-02` | `QR-DATA-008` | Must | `@quimera/data-exodus` | `idempotency_key` | `T-DATA-008`, `AT-08` | Segunda ejecución reporta `inserted = 0` | Demo Exodus |
| Impedir fusiones automáticas peligrosas por similitud | `OBJ-02` | `QR-DATA-009` | Must | `@quimera/data-exodus` | `Conflict(BLOCKING, OPEN)` | `T-DATA-006`, `AT-06` | Entidades ambiguas permanecen separadas hasta aprobación | Demo Exodus |
| Auditar quién resolvió cada contradicción y por qué | `OBJ-02` | `QR-DATA-010` | Must | `@quimera/data-exodus` | `ResolutionDecision` | `T-DATA-007`, `AT-07` | Inmutable; enmienda solo vía `supersedes_decision_id` | Demo Exodus |
| Explicar de qué archivos y decisiones sale un saldo | `OBJ-02` | `QR-DATA-011` | Must | `@quimera/data-exodus` | `ProvenanceEntry` | `T-DATA-011`, `AT-10` | `trace` devuelve archivo, `sha256`, fila, regla y decisión | Demo OficiOS |
| Recuperar una importación interrumpida sin corrupción | `OBJ-02` | `QR-DATA-012` | Must | `@quimera/data-exodus` | `Checkpoint` | `T-DATA-012`, `AT-09` | Corte al 50% + `resume` = resultado bit-a-bit idéntico | Slice 2/3 |
| Validar antes de migrar y bloquear si hay conflictos abiertos | `OBJ-02` | `QR-DATA-013` | Must | `@quimera/data-exodus` | `ReconciliationReport` | `T-DATA-013`, `AT-10` | `--dry-run` escribe 0 filas; bloquea si hay `BLOCKING` | Demo Exodus |
| Extender a SQLite/JSON/PDF sin reescribir el motor | `OBJ-02` | `QR-DATA-014` | Could | `@quimera/data-exodus` | `SourceImporterPort` | `T-DATA-014` | Importador JSON ejemplo pasa contrato sin tocar motor | Post-MVP |

### 2.3. CR API Passport (`QR-PASS-001`..`008`)

| Necesidad del usuario | Objetivo | Requisito | Prioridad | Componente | Contrato | Prueba | Criterio de aceptación | Demo |
|---|---|---|---|---|---|---|---|---|
| Conocer restricciones reales de APIs CR en formato verificable | `OBJ-03` | `QR-PASS-001` | Must | `@quimera/cr-api-passport` | `ApiPassport` YAML | `T-PASS-001`, `AT-11` | Todos los pasaportes validan contra `ApiPassportSchema` | Demo Passport |
| Integrar contribuyentes, CAByS y tipo de cambio vigente | `OBJ-03` | `QR-PASS-002` | Must | `@quimera/cr-api-passport` | 3 pasaportes MVP (`hacienda` + `bccr.sdde`) | `T-PASS-002`, `AT-11` | 3 pasaportes ejecutan en `fixture` y `live` | Demo Passport |
| Detectar si Hacienda o BCCR cambian sus respuestas | `OBJ-03` | `QR-PASS-003` | Must | `@quimera/cr-api-passport` | `DriftReport` | `T-PASS-003`, `AT-11` | Mutación dispara `ERR_PASSPORT_CONTRACT_DRIFT` con diff | Demo Passport |
| Evitar ban IP de 10 minutos en `api.hacienda.go.cr` | `OBJ-03` | `QR-PASS-004` | Must | `@quimera/cr-api-passport` | `RateLimitPolicy` (15/8 req/s) | `T-PASS-004` | Ráfaga de 100 calls nunca excede 15 req/s; respeta `429` | Slice 4 |
| Evitar consultas repetidas innecesarias | `OBJ-03` | `QR-PASS-005` | Must | `@quimera/cr-api-passport` | `CacheMetadata` | `T-PASS-005`, `AT-11` | Segunda consulta dentro TTL retorna `fromCache: true` | Demo Passport |
| No alucinar acceso a APIs con autenticación faltante | `OBJ-03` | `QR-PASS-006` | Must | `@quimera/cr-api-passport` | `ERR_AUTH_MISSING_CREDENTIALS` | `T-PASS-006`, `AT-11` | `bccr-sdde` sin token falla sin tráfico HTTP | Demo Passport |
| Probar integraciones sin depender de Internet | `OBJ-03` | `QR-PASS-007` | Must | `@quimera/cr-api-passport` | Modo `--mode fixture` | `T-PASS-002`, `AT-11` | `call` y `verify` pasan 100% offline | Demo Offline |
| Documentar SNIT y Correos CR sin inventar acceso privado | `OBJ-03` | `QR-PASS-008` | Could | `@quimera/cr-api-passport` | Fichas `accessTier` | `T-PASS-007` | Fichas presentes con acceso real declarado | Post-MVP |

### 2.4. Factura CI (`QR-FCI-001`..`008`)

| Necesidad del usuario | Objetivo | Requisito | Prioridad | Componente | Contrato | Prueba | Criterio de aceptación | Demo |
|---|---|---|---|---|---|---|---|---|
| Probar apps fiscales localmente sin riesgo en Hacienda | `OBJ-04` | `QR-FCI-001` | Must | `@quimera/factura-ci` | Simulador loopback | `T-FCI-001`, `AT-16` | Reproduce 7 modos de fallo solo en `127.0.0.1` | Demo Factura CI |
| Detectar colisiones de consecutivo bajo concurrencia | `OBJ-04` | `QR-FCI-002` | Must | `@quimera/factura-ci` | Escenarios `FC-015..018` | `T-FCI-002`, `AT-16` | `FC-017` falla en `buggy` y pasa en `outbox` | Demo Factura CI |
| Detectar doble facturación ante timeout tras `POST` | `OBJ-04` | `QR-FCI-003` | Must | `@quimera/factura-ci` | Escenario `FC-031` | `T-FCI-003`, `AT-16` | `FC-031` detecta 2ª clave en `buggy` y aprueba `GET` en `outbox` | Demo Factura CI |
| Garantizar que eventos duplicados no emitan dos facturas | `OBJ-04` | `QR-FCI-004` | Must | `@quimera/factura-ci` | Escenarios `FC-009..010` | `T-FCI-004`, `AT-16` | 5 eventos iguales producen 1 envío en simulador | Demo Factura CI |
| Evitar confusión entre pendiente, aceptado y rechazado | `OBJ-04` | `QR-FCI-005` | Must | `@quimera/factura-ci` | Escenarios `FC-005..008` | `T-FCI-005`, `AT-16` | Clasificación exacta de estados intermedios y errores | Demo Factura CI |
| Detectar fugas entre contribuyentes en apps multi-tenant | `OBJ-04` | `QR-FCI-006` | Must | `@quimera/factura-ci` | Escenarios `FC-020..022` | `T-FCI-006`, `AT-16` | 0 cruces de tenant o consecutivo | Demo Factura CI |
| Verificar supervivencia ante reinicios y reglas de NC | `OBJ-04` | `QR-FCI-007` | Must | `@quimera/factura-ci` | Escenarios `FC-012..014`, `FC-023..024` | `T-FCI-007`, `AT-16` | Reconcilia tras restart; rechaza mutar factura aceptada | Demo Factura CI |
| Integrar veredicto en GitHub Actions con aviso legal | `OBJ-04` | `QR-FCI-008` | Must | `@quimera/factura-ci` | `FacturaCiReportSchema` | `T-FCI-008`, `AT-16` | Salida CLI/JSON/JUnit + exit codes `0/1/2` + `disclaimer` | Demo Factura CI |

### 2.5. Fiscal Outbox (`QR-OUT-001`..`007`)

| Necesidad del usuario | Objetivo | Requisito | Prioridad | Componente | Contrato | Prueba | Criterio de aceptación | Demo |
|---|---|---|---|---|---|---|---|---|
| No reescribir la máquina de estados de `hacienda-sdk` | `OBJ-04` | `QR-OUT-001` | Must | `@quimera/fiscal-outbox` | `PgDocumentStore` (`DocumentStore`) | `T-OUT-001` | Implementa `DocumentStore` y `VALID_TRANSITIONS` del SDK | Slice 6 |
| Idempotencia garantizada por venta comercial | `OBJ-04` | `QR-OUT-002` | Must | `@quimera/fiscal-outbox` | `fob_fiscal_intents` UNIQUE | `T-OUT-002` | 20 llamadas simultáneas crean exactamente 1 intención | Demo Factura CI |
| Consecutivos atómicos seguros en multi-proceso | `OBJ-04` | `QR-OUT-003` | Must | `@quimera/fiscal-outbox` | `fob_fiscal_sequences` | `T-OUT-003` | 50 reservas desde 2 procesos sin colisiones ni huecos | Demo Factura CI |
| Procesamiento seguro con múltiples workers y lease | `OBJ-04` | `QR-OUT-004` | Should | `@quimera/fiscal-outbox` | `FOR UPDATE SKIP LOCKED` | `T-OUT-004` | 0 doble procesamiento; recuperación tras expiración de lease | Slice 6 |
| Nunca reenviar `POST` ciegamente tras timeout | `OBJ-04` | `QR-OUT-005` | Must | `@quimera/fiscal-outbox` | Reconciliación `GET` por `clave` | `T-OUT-005`, `AT-16` | Fallo post-POST solo dispara `GET` por clave original | Demo Factura CI |
| Conservar snapshot inmutable y XML firmado/acuse | `OBJ-04` | `QR-OUT-006` | Should | `@quimera/fiscal-outbox` | `fob_fiscal_documents` + CAS | `T-OUT-006` | Mutar pedido no cambia XML firmado almacenado | Slice 6 |
| Desacoplar ejecución de proveedor cloud específico | `OBJ-01` | `QR-OUT-007` | Could | `@quimera/fiscal-outbox` | `OutboxSchedulerPort` | `T-OUT-007` | Cero imports de Cloudflare/Redis en el núcleo | Post-MVP |

### 2.6. QUIMERA Pipeline (`QR-PIPE-001`..`007`)

| Necesidad del usuario | Objetivo | Requisito | Prioridad | Componente | Contrato | Prueba | Criterio de aceptación | Demo |
|---|---|---|---|---|---|---|---|---|
| Componer pasos en DAG sin bucles silenciosos | `OBJ-01` | `QR-PIPE-001` | Must | `@quimera/pipeline` | `pipeline.yaml` (DAG) | `T-PIPE-001`, `AT-12` | Rechaza ciclos antes del paso 1 (`ERR_PIPELINE_INVALID_DAG`) | Demo Pipeline |
| Garantizar contratos compatibles entre pasos conectados | `OBJ-01` | `QR-PIPE-002` | Must | `@quimera/pipeline` | `PipelineStepPort` | `T-PIPE-002`, `AT-12` | Rechaza incompatibilidad antes de correr | Demo Pipeline |
| Auditar y checkpointear cada paso ejecutado | `OBJ-02` | `QR-PIPE-003` | Must | `@quimera/pipeline` | `qum_execution_runs`, `qum_checkpoints` | `T-PIPE-003`, `AT-12` | Checkpoint persistido al terminar cada paso | Demo Pipeline |
| Reanudar flujos tras caída o cancelación | `OBJ-02` | `QR-PIPE-004` | Must | `@quimera/pipeline` | `pipeline resume` | `T-PIPE-004`, `AT-09`, `AT-12` | Reanuda en paso 3/4 sin repetir pasos 1 y 2 | Slice 3 |
| Impedir reintentos automáticos en pasos no idempotentes | `OBJ-01` | `QR-PIPE-005` | Must | `@quimera/pipeline` | Flag `idempotent: boolean` | `T-PIPE-005` | Paso `idempotent: false` no reintenta automáticamente | Slice 3 |
| Pausar flujo cuando requiere decisión humana | `OBJ-02` | `QR-PIPE-006` | Must | `@quimera/pipeline` | `pipeline.human_review` | `T-PIPE-006`, `AT-12` | Pausa en `WAITING_FOR_APPROVAL` (`exit 3`) y reanuda | Demo E2E |
| Soportar compensación explícita sin prometer magia | `OBJ-01` | `QR-PIPE-007` | Should | `@quimera/pipeline` | `compensate()` | `T-PIPE-007` | Fallo ejecuta compensación declarada y la registra | Slice 3 |

### 2.7. OficiOS (`QR-OFI-001`..`007`) y Clairic (`QR-CLAI-001`..`004`)

| Necesidad del usuario | Objetivo | Requisito | Prioridad | Componente | Contrato | Prueba | Criterio de aceptación | Demo |
|---|---|---|---|---|---|---|---|---|
| Mantener OficiOS como consumidor puro del toolkit | `OBJ-05` | `QR-OFI-001` | Must | `apps/oficios` | ESLint boundary | `T-OFI-001`, `AT-13` | 0 imports desde `packages/*` hacia `apps/oficios` | Slice 5 |
| Modelar un oficio real (HVAC) con estados estrictos | `OBJ-05` | `QR-OFI-002` | Must | `apps/oficios` | `hvac-refrigeration-v1` | `T-OFI-002`, `AT-14` | FSM completa; transiciones inválidas devuelven `409` | Demo OficiOS |
| Bloquear cierre o intervención sin autorización del cliente | `OBJ-05` | `QR-OFI-003` | Must | `apps/oficios` | `work_order_approvals` | `T-OFI-002`, `AT-15` | `409 ERR_WORK_ORDER_APPROVAL_REQUIRED` | Demo OficiOS |
| Mostrar en la app operativa la procedencia de datos migrados | `OBJ-05` | `QR-OFI-004` | Must | `apps/oficios` | `provenance_entity_id` | `T-OFI-003`, `AT-14` | Ficha muestra archivo origen, fila y decisión | Demo E2E |
| Registrar diagnóstico fotográfico y materiales CAByS | `OBJ-05` | `QR-OFI-005` | Must | `apps/oficios` | `CR API Passport` + CAS | `T-OFI-004`, `AT-14` | Foto con `sha256` y materiales con código CAByS válido | Demo OficiOS |
| Preparar comprobante fiscal resiliente al cerrar orden | `OBJ-05` | `QR-OFI-006` | Should | `apps/oficios` | `Fiscal Outbox` | `T-OFI-005`, `AT-14` | Cierre encola exactamente 1 `FiscalIntent` idempotente | Demo E2E |
| No depender de WhatsApp para aprobar o cerrar órdenes | `OBJ-05` | `QR-OFI-007` | Could | `apps/oficios` | Puerto opcional notificaciones | `T-OFI-006` | Flujo completo sin credenciales WhatsApp | Post-MVP |
| Mantener Clairic completamente aislado del núcleo | `OBJ-06` | `QR-CLAI-001` | Must/Could | `@quimera/adapter-clairic` | `StructuredExtractorPort` | `T-CLAI-001`, `AT-17` | Desinstalar adaptador mantiene 100% tests en verde | Demo Offline |
| Validar límites de payload Clairic antes de llamar red | `OBJ-06` | `QR-CLAI-002` | Could | `@quimera/adapter-clairic` | Validación local 4 imgs / 8 MiB | `T-CLAI-002`, `AT-18` | Rechaza excesos y URLs remotas localmente | Post-MVP |
| Exigir revisión humana en baja confianza o campos fiscales | `OBJ-06` | `QR-CLAI-003` | Could | `@quimera/adapter-clairic` | `Conflict(AI_LOW_CONFIDENCE)` | `T-CLAI-002`, `AT-18` | `confidence = 0.72` crea conflicto `OPEN` | Post-MVP |
| Contener prompt injection en documentos procesados por IA | `OBJ-06` | `QR-CLAI-004` | Could | `@quimera/adapter-clairic` | Encapsulación `state` sin tools | `T-SEC-004`, `AT-18` | Payload adversario no muta esquema ni aprueba nada | Post-MVP |

### 2.8. Requisitos No Funcionales (`QR-NFR-001`..`012`) y Seguridad (`QR-SEC-001`..`012`)

| Necesidad del usuario | Objetivo | Requisito | Prioridad | Componente | Contrato / Control | Prueba | Criterio de aceptación | Demo |
|---|---|---|---|---|---|---|---|---|
| Migrar 1.000 registros rápidamente en demo y uso real | `OBJ-02` | `QR-NFR-001` | Should | `Data Exodus` | Benchmark `[HIPÓTESIS]` | `T-NFR-BENCH` | ≤ 5s p95 en máquina de referencia | Demo Exodus |
| Consultar procedencia ágilmente en auditorías | `OBJ-02` | `QR-NFR-002` | Should | PostgreSQL / Core | Índices `qum_provenance_entries` | `T-DATA-011`, `T-NFR-BENCH` | ≤ 150 ms p95 con 100k entradas `[HIPÓTESIS]` | Demo OficiOS |
| Evitar escrituras parciales en operaciones multi-tabla | `OBJ-02` | `QR-NFR-003` | Must | PostgreSQL / Todos | Transacciones ACID | `T-DATA-012`, `T-OUT-003` | Rollback completo en inyección de fallo | Slice 2 |
| Recuperar ejecuciones rápido tras reinicio | `OBJ-04` | `QR-NFR-004` | Must | Pipeline / Outbox | Checkpoints + lease | `T-PIPE-004`, `T-FCI-007` | Reanudación ≤ 30s sin duplicar efectos `[HIPÓTESIS]` | Slice 3/6 |
| Consumir contratos desde otros lenguajes | `OBJ-01` | `QR-NFR-005` | Must | Core / Passport | JSON Schema 2020-12 | `T-CORE-001`, `T-PASS-001` | Artefactos JSON Schema generados y validados | Slice 1 |
| Conectar agentes modernos vía MCP stateless | `OBJ-03` | `QR-NFR-006` | Should | `CR API Passport` | MCP spec `2026-07-28` | `T-PASS-007` | Smoke test cliente MCP oficial sobre stdio | Slice 4 |
| Parsear salida CLI limpia en scripts y agentes | `OBJ-01` | `QR-NFR-007` | Must | Todas las CLI | Logs en `stderr`, `--json` en `stdout` | `T-FCI-008`, `T-CORE-005` | `stdout` JSON puro 100% parseable | Demo E2E |
| Levantar entorno local en ≤ 5 minutos | `OBJ-01` | `QR-NFR-008` | Must | Monorepo | Docker Compose + README | `T-NFR-BENCH`, `QG-01` | Instalación limpia en CI Ubuntu ≤ 5 min | Demo Setup |
| Ejecutar sin binarios nativos frágiles entre OS | `OBJ-01` | `QR-NFR-009` | Must | `packages/*` | Node 22 + `node:path` | `T-CORE-003` | 0 deps nativas C++ en núcleo | Slice 1 |
| Mantener código mantenible con fronteras estrictas | `OBJ-01` | `QR-NFR-010` | Must | Monorepo | `strict` TS + ESLint + ≥80% cov | `T-OFI-001`, `QG-01` | Gate PR en verde | Todo PR |
| Controlar cambios de BD sin alteraciones silenciosas | `OBJ-02` | `QR-NFR-011` | Must | Drizzle SQL | Migraciones SQL versionadas | `T-DATA-013`, `QG-04` | BD limpia levanta 100% con migraciones | Slice 2 |
| Evolucionar contratos sin romper consumidores previos | `OBJ-01` | `QR-NFR-012` | Should | Core / Passport | Soporte `N-1` + SemVer | `T-NFR-BENCH`, `QG-03` | Fixtures `N-1` leen sin error | Pre-Release |
| Aislar completamente datos de distintas empresas | `OBJ-04` | `QR-SEC-001` | Must | PostgreSQL / Todos | `tenant_id` + RLS | `T-SEC-001`, `T-FCI-006` | 0 filas cruzadas entre `tenant-A` y `tenant-B` | Demo Factura CI |
| Proteger tokens y contraseñas de fugas en logs/disco | `OBJ-03` | `QR-SEC-002` | Must | Todos | Redacción `pino` + env-only | `T-SEC-002` | 0 apariciones de secretos en logs/reportes/BD | `QG-01` |
| Bloquear ataques desde archivos maliciosos | `OBJ-02` | `QR-SEC-003` | Must | `Data Exodus` | Anti-XXE / Zip-bomb / CSV-inj | `T-SEC-003`, `AT-03` | 100% fixtures maliciosos rechazados/neutralizados | `QG-01` |
| Contener prompt injection si se activa Clairic | `OBJ-06` | `QR-SEC-004` | Could | `@quimera/adapter-clairic` | Encapsulación `state` | `T-SEC-004`, `AT-18` | 0 efectos secundarios adversarios | Post-MVP |
| Garantizar auditoría inmutable (append-only) | `OBJ-02` | `QR-SEC-005` | Must | Core / Exodus / Outbox | Sin `UPDATE`/`DELETE` | `T-SEC-005` | Pruebas de repositorio confirman inmutabilidad | Slice 2 |
| Detectar corrupción o alteración de archivos en CAS | `OBJ-02` | `QR-SEC-006` | Must | `ArtifactStorePort` | Verificación `SHA-256` | `T-SEC-006` | Alterar 1 byte dispara `ERR_ARTIFACT_INTEGRITY_FAILED` | Slice 2 |
| Proteger certificados `.p12` fiscales | `OBJ-04` | `QR-SEC-007` | Must | `Fiscal Outbox` | `.gitignore` + check expiración | `T-SEC-007` | Rechaza cert expirado; bloqueado en git y frontend | Slice 6 |
| Controlar permisos de usuarios en OficiOS | `OBJ-05` | `QR-SEC-008` | Should | `apps/oficios` | RBAC (`ADMIN`/`OPERATOR`/`AUDITOR_READONLY`) | `T-SEC-008` | `AUDITOR_READONLY` recibe `403` al mutar orden | Slice 5 |
| Proteger PII (Ley 8968) y evitar datos reales en repo | `OBJ-02` | `QR-SEC-009` | Must | Todos | Metadato `pii: true` + fixtures sintéticos | `T-SEC-009` | 0 cédulas/datos reales en fixtures del repo | `QG-01` |
| Cumplir conservación fiscal mínima de 5 años (prod) | `OBJ-04` | `QR-SEC-010` | Could | CAS / Outbox | Política 1.825 días | `T-SEC-010` | Configuración validada en diseño y despliegue prod | Post-MVP |
| Proteger supply chain y bloquear scripts arbitrarios | `OBJ-01` | `QR-SEC-011` | Must | Monorepo | `pnpm-lock.yaml` + `pnpm audit` | `T-SEC-011`, `QG-01` | Lockfile bloqueado y auditoría sin críticos | `QG-01` |
| Evitar SSRF o envíos accidentales a producción en tests | `OBJ-04` | `QR-SEC-012` | Must | `Factura CI` / Passport | Loopback-only (`127.0.0.1`) | `T-SEC-012`, `T-FCI-001` | Target fuera de loopback lanza `ERR_SEC_LOOPBACK_ONLY` | Demo Factura CI |
