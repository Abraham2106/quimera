# Estrategia de Pruebas y Aseguramiento de Calidad — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [Matriz de Pruebas](./test-matrix.md) | [Pruebas de Aceptación](./acceptance-tests.md) | [Quality Gates](./quality-gates.md) | [Escenarios de Fallo](./failure-scenarios.md)

---

## 1. Filosofía de Calidad Proporcional al Riesgo

QUIMERA maneja dos dominios de alto costo de fallo: **integridad histórica de datos empresariales** (`Data Exodus`) y **operaciones fiscales irreversibles** (`Fiscal Outbox` / `Factura CI`). Por ello, la estrategia de pruebas se concentra donde los errores reales ocurren —concurrencia, idempotencia, recuperación tras fallos, contratos externos y reconciliación— en lugar de perseguir pruebas triviales de getters/setters.

### Principios Operativos
1. **100% determinista en PR CI:** Ninguna prueba de PR depende de Internet, APIs estatales en vivo ni modelos de IA externos.
2. **Semillas reproducibles:** Todo generador sintético y prueba basada en propiedades (`fast-check`) acepta `--seed` fija y reporta la semilla ante cualquier fallo.
3. **Cero datos reales de personas o contribuyentes (`QR-SEC-009`):** Todos los fixtures utilizan cédulas, razones sociales, montos y certificados sintéticos generados deterministamente.
4. **Frontera clara con `@dojocoding/hacienda-sdk`:** QUIMERA no duplica la suite unitaria del SDK (validadores XSD internos, cálculo matemático de XML). QUIMERA prueba el comportamiento de **sistemas completos** que consumen el SDK (`ADR-010`).

---

## 2. Capas de Pruebas

| Tipo de Prueba | Herramienta | Qué verifica | Frecuencia |
|---|---|---|---|
| **Unitarias** | Vitest | Normalizadores CR, parsers CSV/XLSX/XML, detector de conflictos, FSM de OficiOS, validadores Zod, cálculo exacto `BigInt` | Cada commit / PR |
| **Property-Based Testing** | `fast-check` + Vitest | Determinismo de hashing canónico sin orden de claves (`QR-CORE-008`), idempotencia de normalizadores, invariante de conservación de conteos en lotes aleatorios, ausencia de deriva float en sumas monetarias | Cada PR |
| **Integración (PostgreSQL real)** | Vitest + PostgreSQL 16 (Docker/Service Container) | Migraciones Drizzle, `PgDocumentStore`, reserva concurrente de consecutivos, RLS multi-tenant, checkpoints y reanudación | Cada PR |
| **Pruebas de Contrato** | Vitest + Ajv (JSON Schema 2020-12) + `CR API Passport` | Compatibilidad entre contratos de módulos, detección de deriva en `CR API Passport` (mock en PR, live nocturno), compatibilidad N-1 de esquemas | Cada PR + Cron nocturno (live) |
| **Pruebas de Concurrencia** | Vitest (`Promise.all` / multi-proceso Node) | 20 creaciones simultáneas de `FiscalIntent`, 50 reservas concurrentes de consecutivos desde 2 procesos, 2 workers `SKIP LOCKED`, edición concurrente de `WorkOrder` | Cada PR |
| **Failure Injection / Crash-Recovery** | Simulador `Factura CI` + hooks de inyección de fallo | Timeout TCP post-POST (`FC-031`), `429`/`503`/`409`, kill de proceso al 50% de migración (`UC-09`), expiración de lease de worker | Cada PR |
| **Idempotencia y Reconciliación** | Vitest sobre dataset sintético de 1.000 registros | Re-importación idempotente (`inserted = 0`), detección del 100% de anomalías sembradas (40 clientes repetidos, 12 facturas duplicadas, 7 pagos mal atribuidos, 3 cédulas contradictorias, 1 saldo irreconciliable) | Cada PR |
| **End-to-End (E2E) y Aislamiento** | Vitest + CLI runner + paquete aislado | Flujo completo `Data Exodus -> Pipeline -> OficiOS -> Fiscal Outbox -> Factura CI` en modo offline sin Clairic; instalación limpia de cada `@quimera/*` sin `OficiOS` ni `Clairic` | Cada PR / Release |
| **Seguridad** | Vitest + `pnpm audit` + `gitleaks` | Fixtures maliciosos (XXE, zip-bomb XLSX, path traversal, CSV formula injection, prompt injection stub, fuga cross-tenant, redacción de secretos, loopback-only) | Cada PR |
| **Rendimiento** | Vitest bench / script `pnpm bench` | Benchmarks de `QR-NFR-001` (1.000 registros ≤ 5s) y `QR-NFR-002` (consulta de procedencia ≤ 150 ms con 100k entradas) | Pre-release / nightly |
| **Mutation Testing (Selectivo)** | StrykerJS (post-MVP / pre-v1) | Aplicado **únicamente** en los tres módulos de lógica crítica donde un bug silencioso es catastrófico: (1) motor de reglas de reconciliación, (2) máquina de estados de OficiOS y (3) clasificador de estados inciertos de `Fiscal Outbox` | Pre-release Beta / v1 (no en PR por costo de tiempo) |

---

## 3. Catálogo de Fixtures Sintéticos Reproducibles (`fixtures/`)

Todos los fixtures son generados mediante un script determinista (`scripts/generate-fixtures.ts --seed 20261121`) y versionados en el repositorio:

| Fixture | Contenido | Uso principal |
|---|---|---|
| `fixtures/demo-hvac-1000/` | **7 archivos sintéticos (1.000 registros totales):** `clientes.xlsx` (multi-hoja con fechas Excel y fórmulas), `ventas_2025.csv` (`;` Latin-1 y `,` UTF-8 BOM), `pagos_sinpe.csv`, `equipos_hvac.xlsx`, `inventario_antiguo.csv`, 12 comprobantes `FE 4.4` XML + 2 `FE 4.3` heredados. Contiene sembradas exactamente: **40 clientes repetidos bajo nombres variantes, 12 facturas duplicadas, 7 pagos mal atribuidos, 3 clientes con cédulas contradictorias y 1 saldo imposible de reconciliar**. | Demo oficial de hackathon, `AT-01..AT-10`, `QR-DATA-007`, benchmark `QR-NFR-001`. |
| `fixtures/security-malicious/` | XML con `<!DOCTYPE ... ENTITY>` (XXE), XLSX zip-bomb (ratio > 100:1), CSV con celdas `=CMD\|'/C calc'!A0`, rutas con `../../etc/passwd`, texto con prompt injection para stub de Clairic. | `T-SEC-003`, `T-SEC-004`. |
| `fixtures/passports-cr/` | Respuestas HTTP grabadas y mutadas (campo faltante, tipo cambiado, `400`, `404`, `429` con `Retry-After`, `503`) para `cr.hacienda.taxpayer`, `cr.hacienda.cabys`, `cr.hacienda.fx` y `cr.bccr.sdde`. | `T-PASS-001..007`, demo offline. |
| `fixtures/fiscal-certs-mock/` | Certificado autofirmado sintético (emisor ficticio `3101999999`) + certificado sintético intencionalmente expirado (para probar rechazo `T-SEC-007`). **Cero certificados reales.** | `T-FCI-001..008`, `T-OUT-001..006`, `T-SEC-007`. |
| `fixtures/schema-n-minus-1/` | Artefactos serializados con la versión de esquema anterior (`0.9.0` / `1.0.0`) para validar compatibilidad hacia atrás. | `QR-NFR-012`. |
