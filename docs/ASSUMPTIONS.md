# Registro de Supuestos e Hipótesis — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Vivo — revisar al finalizar MVP y en cada etapa de validación
- **Referencias:** [Plan de Validación](./12-product-strategy/validation-plan.md) | [Cuestiones Abiertas](./OPEN_QUESTIONS.md)

---

## 1. Supuestos Técnicos (`SUP-*`)

| ID | Supuesto | Impacto si resulta falso | Cómo se valida |
|---|---|---|---|
| `SUP-01` | Los usuarios objetivo (desarrolladores/implementadores/CI) pueden ejecutar Node.js 22.13+ y PostgreSQL 16+ (o Docker Compose) en local. | Fricción de instalación en Windows antiguos sin Docker. | `QR-NFR-008` (prueba de instalación limpia) y evaluar perfil SQLite embebido solo para pruebas ligeras de `Data Exodus` post-MVP si surge demanda. |
| `SUP-02` | `@dojocoding/hacienda-sdk@0.13.0` permanece disponible en npm y compatible con Node 22 ESM sin romper la interfaz `DocumentStore` durante el MVP. | Requeriría parchear adaptador de `Fiscal Outbox` o `Data Exodus`. | Lockfile fijado (`pnpm-lock.yaml`) + adaptador delgado (`ADR-010`). |
| `SUP-03` | Los 3 formatos MVP de `Data Exodus` (CSV, XLSX, XML FE 4.4/4.3) cubren la mayoría de los archivos administrativos iniciales de una PYME en Costa Rica. | PYMEs que solo tienen PDFs escaneados o DBs propietarias quedarían fuera del MVP. | Experimento 2 (`validation-plan.md`) con datasets reales de 2–3 PYMEs CR. |
| `SUP-04` | El umbral conservador de tasa en `CR API Passport` (15 req/s ráfaga, 8 req/s sostenido) evita el ban IP de 10 min de `api.hacienda.go.cr` en redes individuales (aunque no elimina bans causados por terceros bajo el mismo CGNAT). | Posibles HTTP `429` esporádicos en redes compartidas como coworkings. | Caché TTL agresivo + circuit breaker de ≥60s + modo `--mode fixture` offline para demos. |
| `SUP-05` | El sistema operativo objetivo de producción para PYMEs puede respaldar PostgreSQL (PITR) y almacenar artefactos XML en S3/R2 durante 5 años bajo costos acotados. | Costo operativo mayor si un taller sube miles de fotos sin compresión. | Cuotas y compresión de imágenes en `OficiOS` (conservando hash del artefacto almacenado). |

---

## 2. Hipótesis Medibles de Rendimiento y Calidad (`HIP-TEC-*` — Pendientes de Benchmark Real)

| ID | Hipótesis (`[HIPÓTESIS]`) | Requisito asociado | Validación prevista |
|---|---|---|---|
| `HIP-TEC-01` | Ingestar, perfilar, reconciliar y cargar 1.000 registros (7 archivos) toma ≤ 5 segundos p95 en máquina de referencia (4 vCPU, 8 GB RAM, PG 16 local). | `QR-NFR-001` | Benchmark `pnpm bench:exodus` en Slice 7. |
| `HIP-TEC-02` | Consultar la procedencia completa de una entidad en PostgreSQL toma ≤ 150 ms p95 con 100.000 entradas en `qum_provenance_entries`. | `QR-NFR-002` | Benchmark SQL con `EXPLAIN ANALYZE` en Slice 7. |
| `HIP-TEC-03` | Una corrida interrumpida de Pipeline o Fiscal Outbox reanuda en ≤ 30 segundos tras reinicio. | `QR-NFR-004` | Pruebas `T-PIPE-004` y `T-FCI-007`. |
| `HIP-TEC-04` | Cobertura de líneas ≥ 80% en `core`, `data-exodus` y `fiscal-outbox` es alcanzable y útil sin generar tests frágiles. | `QR-NFR-010` | Medición en `QG-01` durante Slices 1–7. |
| `HIP-TEC-05` | El umbral Jaro-Winkler ≥ 0.88 con remoción de sufijos legales CR (`S.A.`, `S.R.L.`, `Ltda.`) captura ≥ 95% de duplicados probables sin exceso de falsos positivos. | `QR-DATA-007` | Prueba sobre `demo-hvac-1000` y datasets reales en Experimento 2. |
| `HIP-TEC-06` | Objetivos de producción PYME (RPO ≤ 5 min, RTO ≤ 30 min, disponibilidad 99.5% horario laboral CR) son adecuados para talleres pequeños. | `reliability-and-recovery.md` | Validar costo/beneficio antes de etapa Pilotos Empresariales. |

---

## 3. Hipótesis de Producto y Mercado (`H-01`..`H-05` — No Validadas)

Todas las hipótesis comerciales se detallan con sus criterios de confirmación y refutación en [`docs/12-product-strategy/validation-plan.md`](./12-product-strategy/validation-plan.md):
- **`H-01`:** Adopción orgánica de `CR API Passport` por verificación de deriva y guardrails frente a wrappers MCP simples.
- **`H-02`:** `Factura CI` descubre bugs reales no detectados en apps fiscales existentes de terceros.
- **`H-03`:** `Data Exodus` ahorra esfuerzo y riesgo real frente a scripts ad-hoc con IA en migraciones sucias de PYMEs.
- **`H-04`:** Talleres HVAC de 1–5 técnicos en CR tienen dolores no resueltos por TallerApp/Astra y disposición a pagar por `OficiOS`.
- **`H-05`:** Existencia de comprador con presupuesto asignable antes de escalar comercialmente.
