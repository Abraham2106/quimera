# Plan de MVP y Ejecución de Hackathon — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Plan ejecutable aprobado para iniciar desarrollo
- **Referencias:** [Alcance y Prioridades](../03-requirements/scope-and-priorities.md) | [Backlog](./implementation-backlog.md) | [Grafo de Dependencias](./dependency-graph.md)

---

## 1. Arquitectura Mínima Viable (MVA)

El objetivo del MVP no es construir cinco productos gigantes a medias, sino entregar la **menor arquitectura técnicamente íntegra** capaz de demostrar de principio a fin:

> **Importación (`Data Exodus`) → Reconciliación con Compuerta Humana → Migración a PostgreSQL → Operación (`OficiOS`) → Verificación Fiscal (`Factura CI` + `Fiscal Outbox`)**, enriquecida por **`CR API Passport`** y compuesta por **`QUIMERA Pipeline`**, **100% offline y sin IA obligatoria**.

### Qué se construye real vs qué se simplifica sin sacrificar integridad

| Capacidad | En el MVP (Real, no simulado) | Qué se reemplaza/simplifica en MVP | Qué NUNCA se sacrifica |
|---|---|---|---|
| **Almacenamiento** | PostgreSQL 16 (Docker Compose) + CAS local en disco (`SHA-256`) | Sin S3/R2 cloud ni clúster HA | Transacciones ACID, `tenant_id NOT NULL`, inmutabilidad `append-only` |
| **`Data Exodus`** | Parsers CSV (`csv-parse`), XLSX (`exceljs`), XML FE 4.4 (`hacienda-sdk`), perfilador, 10 reglas de conflicto, decisiones humanas, carga a PG + informe | Sin importadores PDF/correo/SQLite; `mapping.yaml` pre-generable y editable | Cero pérdida silenciosa, idempotencia exacta y procedencia a nivel de registro |
| **`CR API Passport`** | 3 pasaportes (`taxpayer`, `cabys`, `fx/bccr-sdde`), rate limiter, caché TTL, detector de deriva (`verify`) y modo `--mode fixture` | Sin despliegue Cloudflare Workers; servidor MCP en prioridad *Should* | Validación Zod estricta, cero invención de credenciales BCCR/Correos |
| **`Fiscal Outbox`** | `PgDocumentStore` sobre `hacienda-sdk/delivery`, `fob_fiscal_intents` UNIQUE, `fob_fiscal_sequences` atómico, reconciliación `GET` post-timeout | Sin Cloudflare Workflows; worker Node local con `SKIP LOCKED` | Cero colisión de consecutivos y cero reenvío `POST` ciego tras timeout |
| **`Factura CI`** | Simulador loopback determinista (`127.0.0.1`), 25 escenarios críticos (`FC-001..024` + `FC-031`), `demo-pos-buggy` vs `demo-pos-outbox`, reporte JSON/CLI/JUnit | Sin plugin Marketplace publicado todavía | Reproducibilidad total con `--seed`, aislamiento loopback, aviso sintético |
| **`OficiOS`** | API Hono + UI web minimalista para contrato `hvac-refrigeration-v1`, bloqueo HTTP `409` sin aprobación y panel de procedencia desde `Data Exodus` | Sin PWA offline IndexedDB, sin WhatsApp Adapter live, sin multi-oficio | Máquina de estados estricta y separación total respecto de `packages/*` |
| **`Clairic`** | Solo puerto `StructuredExtractorPort` en Core + prueba de aislamiento sin instalar adaptador | Sin inferencia Workers AI ni GPU | Cero dependencia de IA en el baseline |

---

## 2. Secuencia de 7 Vertical Slices

Cada slice entrega un incremento verificable y ejecutable (nunca capas horizontales desconectadas):

| Slice | Nombre | Entregable verificable al cierre | Dependencias |
|---|---|---|---|
| **Slice 1** | **Núcleo, Contratos y Primer Importador** | Monorepo `pnpm` + Turborepo, `@quimera/core` (Zod + JSON Schema 2020-12 + puertos + errores), Docker PG 16, CAS local e importador CSV de `@quimera/data-exodus` con `T-CORE-001..010` y `T-DATA-001` en verde. | Ninguna |
| **Slice 2** | **XLSX, XML FE 4.4, Procedencia y PostgreSQL** | Importadores XLSX + XML (`hacienda-sdk`), esquema Drizzle completo (`qum_*`), `qum_provenance_entries`, idempotencia (`T-DATA-008`) y `demo-hvac-1000` (generador sintético determinista de 7 archivos / 1.000 registros). | Slice 1 |
| **Slice 3** | **Reconciliación, Revisión Humana y Pipeline** | Motor de 10 reglas de conflicto, decisiones inmutables (`qum_decisions`), carga destino con `--dry-run`, `@quimera/pipeline` (DAG + checkpoints + pausa `exit 3` + `resume`). | Slice 2 |
| **Slice 4** | **CR API Passport** | `@quimera/cr-api-passport` con los 3 pasaportes verificados, fixtures offline, rate limiter, caché, detector de deriva (`verify`) y (si hay margen) transporte MCP `stdio`. | Slice 1 (paralelizable con Slices 2 y 3) |
| **Slice 5** | **OficiOS Consumiendo Datos Migrados** | `apps/oficios` (API Hono + UI ligera) leyendo clientes/equipos migrados por Slice 3, mostrando procedencia, buscando CAByS vía Slice 4 y bloqueando cierres sin aprobación (`HTTP 409`). | Slices 3 y 4 |
| **Slice 6** | **Fiscal Outbox y Factura CI** | `@quimera/fiscal-outbox` (`PgDocumentStore` + consecutivos atómicos + worker), `@quimera/factura-ci` (simulador loopback + 25 escenarios) y comparativa `demo-pos-buggy` (falla `FC-017`/`FC-031`) vs `demo-pos-outbox` (pasa). | Slice 1 (paralelizable con Slices 2–5) |
| **Slice 7** | **Integración E2E, Demo Offline y Hardening** | Conexión `OficiOS -> Fiscal Outbox`, script único `pnpm demo:verify` 100% offline, pruebas de aislamiento por paquete (`T-CORE-003`), auditoría de seguridad (`T-SEC-*`) y ensayo de demo. | Slices 5 y 6 |

---

## 3. Plan Operativo para Ventana Limitada de Hackathon (Dojo AI Hackathon 2026)

### 3.1. Qué debe quedar listo primero (Camino Crítico)
1. **Bloque Inicial (Cimientos):** Slice 1 + generador sintético `demo-hvac-1000`. Sin el dataset sintético determinista no se puede probar ni demostrar `Data Exodus`.
2. **Bloque Paralelo Core:**
   - Carril A (Datos): Slices 2 y 3 (`Data Exodus` + `Pipeline`).
   - Carril B (Fiscal + APIs): Slice 4 (`CR API Passport`) y Slice 6 (`Fiscal Outbox` + `Factura CI` + `demo-pos`).
3. **Bloque de Integración Temprana:** Integrar Slice 5 (`OficiOS`) tan pronto Slice 3 produzca la carga a PostgreSQL; **no esperar al último tramo para integrar módulos**.

### 3.2. Plan de Recorte Controlado (si se agota el margen de ejecución)
En orden estricto de recorte, sin romper la historia principal ni la integridad:
1. **Primer recorte (`Should`):** Servidor MCP `stdio` de `CR API Passport` (mantener CLI + SDK + `verify`).
2. **Segundo recorte (`Should`):** Segundo worker simultáneo `SKIP LOCKED` y modo JUnit XML (mantener concurrencia de consecutivos, `FC-017`, `FC-031` y reporte terminal/JSON).
3. **Tercer recorte (`Should`):** UI web elaborada de `OficiOS` (reducir a vista web esencial de 3 pantallas: Clientes+Procedencia, Orden+Bloqueo 409, Cierre+Estado Fiscal).
4. **NUNCA recortar:** Dataset `demo-hvac-1000` (40+12+7+3+1), procedencia verificable, bloqueo `409` en `OficiOS`, detección de deriva en `CR API Passport` y comparativa `demo-pos-buggy` vs `demo-pos-outbox` en `Factura CI`.

### 3.3. Regla de Congelación y Pruebas Finales
- **Feature Freeze:** Al cerrar Slice 7 no se agregan características nuevas; el último bloque se dedica exclusivamente a ejecutar `QG-06` (`pnpm demo:verify`), verificar instalación limpia en contenedor y grabar respaldo visual de la demo por contingencia de proyector.

---

## 4. Guión de Demostración 100% Offline (Sin Servicios Externos)

Para eliminar el riesgo de Wi-Fi del recinto o ban IP CGNAT en `api.hacienda.go.cr`:
1. **Acto 1 — Rescate y Reconciliación (`Data Exodus` + `Pipeline`):** Ejecutar `quimera pipeline run ./pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo`. El pipeline ingiere 7 archivos (1.000 registros), detecta las 40+12+7+3+1 anomalías sembradas y **pausa automáticamente (`exit code 3`)** sin fusionar clientes ambiguos. Se aplica el archivo de resoluciones humanas auditables (`decisions-demo.yaml`), se reanuda (`pipeline resume`) y se completa la carga a PostgreSQL con informe de conciliación cuadrado.
2. **Acto 2 — Continuidad Operativa (`OficiOS` + `CR API Passport` en `--mode fixture`):** Abrir `OficiOS`, inspeccionar a «Distribuidora Rodríguez» mostrando su procedencia exacta (`clientes.xlsx` + `FE-204.xml` + decisión humana). Crear orden HVAC, buscar repuesto CAByS desde caché/fixture, intentar cerrar sin aprobación → **bloqueo HTTP `409` visible**. Registrar aprobación del cliente → cerrar orden y ver `FiscalIntent` encolada.
3. **Acto 3 — Detección de Deriva (`CR API Passport`):** Ejecutar `quimera passport verify --all --mode fixture` (verde) y luego contra el fixture con deriva simulada → `ERR_PASSPORT_CONTRACT_DRIFT` con diff exacto.
4. **Acto 4 — Verificación Fiscal (`Factura CI` + `Fiscal Outbox`):** Ejecutar `quimera factura-ci run` contra `demo-pos-buggy` → falla `FC-017` (consecutivo duplicado) y `FC-031` (doble emisión tras timeout). Ejecutar exactamente el mismo comando contra `demo-pos-outbox` → **25/25 pruebas aprobadas (`exit code 0`)**.
