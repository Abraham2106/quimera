# Backlog Ejecutable de Implementación — QUIMERA (MVP)

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Listo para ejecución por ingenieros o agentes de programación
- **Convención de complejidad relativa:** `S` (acotada, 1 módulo, bajo riesgo), `M` (múltiples archivos/integración PG, riesgo moderado), `L` (lógica compleja de concurrencia, reconciliación o integración multi-módulo). *No se usan estimaciones de calendario.*

---

## Slice 1 — Núcleo, Contratos y Primer Importador

| ID | Historia / Tarea | Objetivo | Dependencias | Módulos / Rutas afectadas | Criterios de aceptación | Pruebas requeridas | Riesgos | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| `US-001` | Bootstrap de monorepo `pnpm` + Turborepo + calidad base | Configurar workspace ESM Node 22+, TS `strict`, ESLint con regla de fronteras (`packages/*` ≠ `apps/*`), Vitest, Changesets y Docker Compose PG 16 | Ninguna | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `docker-compose.yml`, `.eslintrc*` | `pnpm install`, `pnpm typecheck`, `pnpm lint` y PG 16 levantan en <5 min | `QG-01` smoke | Config ESM/CJS incompatible | `S` | Must |
| `US-002` | Contratos canónicos y puertos en `@quimera/core` | Implementar esquemas Zod v4, generador JSON Schema Draft 2020-12, `QuimeraError`, aritmética monetaria `BigInt`, normalizadores CR y puertos (`ArtifactStorePort`, `StructuredExtractorPort`, `ClockPort`, `LoggerPort`) | `US-001` | `packages/core/src/*` | Cero deps runtime fuera de `zod`; JSON Schema válido; determinismo en 200 property tests | `T-CORE-001`, `T-CORE-002`, `T-CORE-005..010` | Fuga de tipos específicos de PG o OficiOS al Core | `M` | Must |
| `US-003` | Almacenamiento CAS local con verificación `SHA-256` | Implementar `FsArtifactStore` sobre `ArtifactStorePort` con escritura atómica, bloqueo de path traversal y verificación `SHA-256` al leer | `US-002` | `packages/core/src/storage/*` o `packages/data-exodus/src/storage/*` | Alterar 1 byte dispara `ERR_ARTIFACT_INTEGRITY_FAILED`; path traversal bloqueado | `T-SEC-003`, `T-SEC-006` | Permisos FS entre Linux/macOS | `S` | Must |
| `US-004` | Esquema PostgreSQL inicial (`qum_*`) y migraciones Drizzle | Definir tablas `qum_tenants`, `qum_schema_versions`, `qum_data_sources`, `qum_artifacts`, `qum_import_batches`, `qum_raw_records`, `qum_entities`, `qum_entity_relations`, `qum_provenance_entries`, `qum_conflicts`, `qum_decisions`, `qum_execution_runs`, `qum_checkpoints` + RLS | `US-002` | `packages/data-exodus/drizzle/*`, `packages/data-exodus/src/db/*` | Migración limpia en PG 16 vacío; `tenant_id NOT NULL` en toda tabla; sin `ON DELETE CASCADE` en auditoría | `QG-04`, `T-SEC-001`, `T-SEC-005` | Desalineación entre DDL y Zod | `M` | Must |
| `US-005` | Importador CSV (`csv-parse`) con conteo sin pérdida | Ingerir CSV con `,`/`;`/`\t`, UTF-8 BOM y Latin-1, guardando archivo en CAS y filas en `qum_raw_records` con `rowNumber` y manejo de `PARSE_ERROR` | `US-003`, `US-004` | `packages/data-exodus/src/importers/csv.ts` | `total_rows_seen == parsed_ok + parse_errors + skipped_empty`; tildes íntegras | `T-DATA-001`, `AT-01`, `T-SEC-003` | Detección errónea de Latin-1 | `M` | Must |

---

## Slice 2 — XLSX, XML FE 4.4, Procedencia y Dataset Sintético

| ID | Historia / Tarea | Objetivo | Dependencias | Módulos / Rutas afectadas | Criterios de aceptación | Pruebas requeridas | Riesgos | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| `US-006` | Importador XLSX (`exceljs`) seguro | Leer múltiples hojas preservando `xlsx:Hoja!row:N`, convertir fechas seriales a ISO-8601, advertir fórmulas sin caché y bloquear zip-bombs (>50 MiB) | `US-003`, `US-004` | `packages/data-exodus/src/importers/xlsx.ts` | Fixture multi-hoja trazado al 100%; zip-bomb rechazado | `T-DATA-002`, `AT-02`, `T-SEC-003` | Fórmulas complejas sin valor cacheado | `M` | Must |
| `US-007` | Importador XML fiscal vía `@dojocoding/hacienda-sdk` | Bloquear XXE/`DOCTYPE`, invocar `parseDocumentXml` del SDK para FE 4.4 (advirtiendo 4.3), extraer clave 50 dígitos, CAByS y totales | `US-003`, `US-004` | `packages/data-exodus/src/importers/fe-xml.ts` | Extrae 100% totales y clave sin parser duplicado; XXE rechazado | `T-DATA-003`, `AT-03`, `T-SEC-003` | Diferencias XML 4.3 vs 4.4 | `M` | Must |
| `US-008` | Idempotencia de ingestión y generador sintético `demo-hvac-1000` | Implementar `idempotency_key` en lotes y script determinista (`--seed 20261121`) que genera los 7 archivos (1.000 registros + 40+12+7+3+1 anomalías sintéticas sin datos reales) | `US-005`, `US-006`, `US-007` | `scripts/generate-fixtures.ts`, `fixtures/demo-hvac-1000/*`, `packages/data-exodus/src/ingest.ts` | Re-ingesta produce `inserted = 0`; 0 cédulas reales | `T-DATA-008`, `AT-08`, `T-SEC-009` | Anomalías mal sembradas | `M` | Must |

---

## Slice 3 — Reconciliación, Revisión Humana y Pipeline

| ID | Historia / Tarea | Objetivo | Dependencias | Módulos / Rutas afectadas | Criterios de aceptación | Pruebas requeridas | Riesgos | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| `US-009` | Perfilador estructural y generador de `mapping.yaml` | Detectar tipos, nulos, cédulas CR, CAByS, claves, formatos de fecha/moneda y proponer `mapping.yaml` editable con puntajes de confianza | `US-008` | `packages/data-exodus/src/profile/*`, `packages/data-exodus/src/mapping/*` | Detecta ≥95% columnas estándar en `demo-hvac-1000`; marca ambiguas `NEEDS_REVIEW` | `T-DATA-004`, `T-DATA-005`, `AT-04`, `AT-05` | Falsos positivos en columnas de texto libre | `M` | Must |
| `US-010` | Motor de reconciliación (10 reglas) y conflictos conservadores | Detectar las 10 clases de conflicto (`EXACT_DUPLICATE` auto-resuelto; las otras 9 generan `Conflict` sin fusión silenciosa) | `US-009` | `packages/data-exodus/src/reconcile/*` | Detecta 100% de las 40+12+7+3+1 anomalías de `demo-hvac-1000` | `T-DATA-006`, `AT-06` | Umbral Jaro-Winkler muy laxo o muy estricto | `L` | Must |
| `US-011` | Registro inmutable de decisiones humanas y consulta `trace` | Implementar CLI/SDK para listar y resolver conflictos (`MERGE`, `KEEP_SEPARATE`, `OVERRIDE_FIELD`, `MARK_UNRECONCILABLE`, aplicación de `decisions.yaml`) + consulta `trace` de procedencia | `US-010` | `packages/data-exodus/src/decisions/*`, `packages/data-exodus/src/provenance/*` | Inmutable (`supersedes_decision_id`); `trace` devuelve cadena completa | `T-DATA-007`, `T-DATA-011`, `AT-07` | Complejidad de joins al consultar linaje profundo | `M` | Must |
| `US-012` | Carga destino a PostgreSQL (`--dry-run`, bloqueo, reporte) | Materializar entidades verificadas en `TargetSchema` (`oficios-v1`), soportar `--dry-run`, bloquear si hay `BLOCKING OPEN` y emitir `ReconciliationReport` | `US-011` | `packages/data-exodus/src/migrate/*`, `packages/data-exodus/src/cli.ts` | `--dry-run` deja 0 filas; reporte cuadra totales por moneda | `T-DATA-013`, `AT-10` | Fuga de supuestos de OficiOS dentro de Exodus | `M` | Must |
| `US-013` | Motor DAG `@quimera/pipeline` con checkpoints y compuerta humana | Validar aciclicidad y SemVer, ejecutar pasos con `qum_checkpoints`, pausar en `WAITING_FOR_APPROVAL` (`exit 3`), soportar `resume` tras crash y solo reintentar `idempotent: true` | `US-004`, `US-012` | `packages/pipeline/src/*` | Corte tras paso 2 + `resume` = resultado idéntico; ciclo rechazado antes del paso 1 | `T-PIPE-001..007`, `T-DATA-012`, `AT-09`, `AT-12` | Semántica confusa en compensaciones | `L` | Must |

---

## Slice 4 — CR API Passport (Paralelizable tras Slice 1)

| ID | Historia / Tarea | Objetivo | Dependencias | Módulos / Rutas afectadas | Criterios de aceptación | Pruebas requeridas | Riesgos | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| `US-014` | Esquema `ApiPassport` y 3 pasaportes verificados CR | Definir `ApiPassportSchema` y manifiestos + fixtures para `cr.hacienda.taxpayer`, `cr.hacienda.cabys` y `cr.hacienda.fx` + `cr.bccr.sdde` (más fichas informativas SNIT y Correos CR) | `US-002` | `packages/cr-api-passport/passports/*`, `packages/cr-api-passport/fixtures/*` | 100% validan contra schema; sin endpoints inventados para Correos CR | `T-PASS-001`, `T-PASS-002`, `T-PASS-007` | Inconsistencias en rutas BCCR SDDE | `M` | Must |
| `US-015` | Cliente HTTP con rate limiter, caché TTL y control de auth | Implementar bucket conservador (15/8 req/s), manejo `429 Retry-After`, caché TTL con `fromCache` y rechazo rápido `ERR_AUTH_MISSING_CREDENTIALS` para BCCR sin token | `US-014` | `packages/cr-api-passport/src/client/*` | Ráfaga de 100 reqs no supera 15/s; 2ª llamada usa caché; BCCR sin token = 0 tráfico HTTP | `T-PASS-004`, `T-PASS-005`, `T-PASS-006` | Ban IP en pruebas accidentales live | `M` | Must |
| `US-016` | Detector de deriva (`verify`), CLI `--json` y generador TS | Comparar respuesta real/fixture contra schema del pasaporte reportando `ERR_PASSPORT_CONTRACT_DRIFT` con diff exacto + CLI `inspect`/`query`/`verify`/`generate` | `US-015` | `packages/cr-api-passport/src/verify/*`, `packages/cr-api-passport/src/cli.ts` | Detecta campo faltante, cambio de tipo y status inesperado en modo `fixture` | `T-PASS-003`, `AT-11` | Falsos positivos ante campos opcionales aditivos | `M` | Must |
| `US-017` | Servidor MCP `stdio` de solo lectura para `CR API Passport` | Exponer `passport_list`, `passport_inspect`, `passport_query`, `passport_verify` vía `@modelcontextprotocol/sdk` marcando `untrustedExternalData: true` | `US-016` | `packages/cr-api-passport/src/mcp/*` | Cliente MCP lista, consulta y verifica deriva en modo `fixture` | `T-PASS-007` | Desvíos de spec MCP | `S` | Should |

---

## Slice 5 — OficiOS como Consumidor Puro

| ID | Historia / Tarea | Objetivo | Dependencias | Módulos / Rutas afectadas | Criterios de aceptación | Pruebas requeridas | Riesgos | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| `US-018` | Esquema `ofi_*`, contrato `hvac-refrigeration-v1` y FSM estricta | Crear tablas `ofi_customers`, `ofi_equipment`, `ofi_work_orders`, `ofi_work_order_events`, máquina de estados con bloqueo `409` sin aprobación y concurrencia optimista (`version`) | `US-004`, `US-012` | `apps/oficios/drizzle/*`, `apps/oficios/src/domain/*` | 0 imports desde `packages/*` hacia `apps/oficios`; transición sin aprobación retorna `409` | `T-OFI-001`, `T-OFI-002`, `AT-15` | Acoplar reglas de taller al Core | `M` | Must |
| `US-019` | API HTTP Hono de OficiOS con RBAC, procedencia y CAByS | Exponer endpoints `/api/v1/*` (`customers`, `provenance`, `equipment`, `work-orders`, `approvals`, `evidence`, `cabys`), middleware de roles (`ADMIN`/`OPERATOR`/`AUDITOR_READONLY`) | `US-016`, `US-018` | `apps/oficios/src/api/*` | Muestra procedencia de clientes migrados; consulta CAByS vía Passport; `AUDITOR_READONLY` recibe `403` | `T-OFI-003`, `T-OFI-004`, `T-SEC-008` | Fuga cross-tenant si falla middleware | `M` | Must |
| `US-020` | UI Web minimalista de OficiOS para demo operativa | Vistas limpias en español CR: lista/ficha de clientes + panel «Ver origen del registro», flujo de orden HVAC con evidencia fotográfica, bloqueo visible de aprobación y cierre | `US-019` | `apps/oficios/web/*` | Flujo completo `RECEIVED -> CLOSED` demostrable sin jerga técnica y sin XSS | `AT-14`, `AT-15` | Sobrealcance visual en hackathon | `M` | Must |

---

## Slice 6 — Fiscal Outbox y Factura CI (Paralelizable tras Slice 1)

| ID | Historia / Tarea | Objetivo | Dependencias | Módulos / Rutas afectadas | Criterios de aceptación | Pruebas requeridas | Riesgos | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| `US-021` | `PgDocumentStore`, `fob_*` y reserva atómica de consecutivos | Implementar `DocumentStore` de `@dojocoding/hacienda-sdk/delivery` sobre PostgreSQL, `fob_fiscal_intents` UNIQUE y `fob_fiscal_sequences` atómico por `issuerId` | `US-002`, `US-004` | `packages/fiscal-outbox/drizzle/*`, `packages/fiscal-outbox/src/store/*` | 20 intents simultáneos = 1 fila; 50 secuencias desde 2 procesos sin huecos ni colisiones | `T-OUT-001`, `T-OUT-002`, `T-OUT-003` | Bloqueos deadlock en alta concurrencia | `L` | Must |
| `US-022` | Worker de `Fiscal Outbox` y reconciliación segura post-timeout | Reclamar documentos con `FOR UPDATE SKIP LOCKED` + lease; ante timeout post-`POST`, nunca reenviar `POST` y reconciliar vía `GET` por misma clave; conservar XML firmado/acuse inmutables | `US-021` | `packages/fiscal-outbox/src/worker/*`, `packages/fiscal-outbox/src/cli.ts` | Fallo post-`POST` solo dispara `GET`; 2 workers no duplican envío; cert expirado rechazado | `T-OUT-004..006`, `T-SEC-007` | Bugs sutiles en transición `INCIERTO` | `L` | Must |
| `US-023` | Simulador loopback determinista de `@quimera/factura-ci` | Levantar servidor HTTP exclusivamente en `127.0.0.1` sin redirecciones, inyectando los 7 modos de fallo (`201`, `rechazado`, `procesando`, `409`, `429`, `503`, corte TCP post-POST) | `US-002` | `packages/factura-ci/src/simulator/*` | Rechaza direcciones no-loopback (`ERR_SEC_LOOPBACK_ONLY`); reproduce 7 modos con `--seed` | `T-FCI-001`, `T-SEC-012` | Flakiness en timeouts TCP | `M` | Must |
| `US-024` | Suite de 25 escenarios (`FC-001..024` + `FC-031`) y reportes | Implementar runner de escenarios conductuales, verificación XML vía `hacienda-sdk`, salida terminal/JSON/JUnit + `disclaimer` obligatorio y exit codes `0/1/2` | `US-023` | `packages/factura-ci/src/scenarios/*`, `packages/factura-ci/src/cli.ts` | Detecta fallos de concurrencia, timeout, estados, duplicados, aislamiento y reinicio | `T-FCI-002..008` | Condiciones de carrera en aserciones del test | `L` | Must |
| `US-025` | Aplicaciones comparativas `demo-pos-buggy` vs `demo-pos-outbox` | Crear SUT mínima en dos modos: `buggy` (consecutivos en memoria y reenvío ciego tras timeout) y `outbox` (respaldada por `@quimera/fiscal-outbox`) | `US-022`, `US-024` | `apps/demo-pos/src/*` | `Factura CI` reprueba `buggy` (`FC-017`, `FC-031`, `exit 1`) y aprueba `outbox` (25/25, `exit 0`) | `AT-16` | Mantener `demo-pos` simple y rápido de arrancar | `M` | Must |

---

## Slice 7 — Integración E2E, Aislamiento y Hardening Final

| ID | Historia / Tarea | Objetivo | Dependencias | Módulos / Rutas afectadas | Criterios de aceptación | Pruebas requeridas | Riesgos | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| `US-026` | Integración `OficiOS -> Fiscal Outbox` al cierre de orden | Encolar 1 `FiscalIntent` idempotente al pasar orden a `CLOSED` y mostrar estado fiscal separado en la ficha | `US-019`, `US-022` | `apps/oficios/src/fiscal/*` | Cierre repetido no duplica `FiscalIntent`; orden sigue cerrada aunque simulador esté apagado | `T-OFI-005`, `AT-14` | Acoplar cierre de orden a respuesta HTTP síncrona | `S` | Should |
| `US-027` | Pruebas de aislamiento por paquete, baseline sin IA y seguridad transversal | Automatizar `pnpm test:isolation` (instalar cada `@quimera/*` sin `OficiOS` ni `Clairic`), suite `T-SEC-001..012` y benchmark `QR-NFR-001`/`002` | `US-013`, `US-016`, `US-020`, `US-025` | `scripts/test-isolation.ts`, `tests/e2e/*`, `tests/security/*` | 100% verde con red bloqueada y sin `@quimera/adapter-clairic` | `T-CORE-003`, `T-CORE-004`, `T-CLAI-001`, `T-SEC-001..012`, `AT-13`, `AT-17` | Fuga de dependencia transitiva oculta | `M` | Must |
| `US-028` | Script reproducible `pnpm demo:verify`, README raíz y ejemplos | Unificar el guión offline completo de 4 actos en un comando verificable + `README.md` + 4 ejemplos mínimos en `examples/` | `US-026`, `US-027` | `README.md`, `scripts/demo-verify.ts`, `examples/*` | `QG-06` pasa de extremo a extremo en máquina limpia sin Internet | `QG-06`, `QR-NFR-008` | Desincronización entre docs y comandos reales | `S` | Must |

---

## Historias Post-MVP (Registradas Fuera del Camino Crítico del Hackathon)

| ID | Historia | Etapa destino | Prioridad |
|---|---|---|---|
| `US-029` | Implementación opcional de `@quimera/adapter-clairic` (validación local 4 imgs/8 MiB + compuerta `confidence < 0.90` + anti-prompt-injection) | Pilotos / Post-MVP | Could |
| `US-030` | Importadores SQLite legacy y JSON sobre `SourceImporterPort` | Beta Técnica | Could |
| `US-031` | Adaptador opcional de notificaciones WhatsApp (`@dojocoding/whatsapp-sdk`) en `OficiOS` | Pilotos | Could |
| `US-032` | Pasaporte ejecutable SNIT (OGC API-Features) y publicación de skill en `Dojo Marketplace` | Beta Técnica | Could |
