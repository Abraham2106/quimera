# Estado de Preparación e Implementación — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado actual:** MVP de los slices 1–7 verificado. Post-MVP `WBS-8.1`..`WBS-8.4` añadido sin regresiones.
- **Código de producto:** MVP implementado en el monorepo. La verificación de demostración es `QUIMERA_AI_ENABLED=false pnpm demo:verify`.

---

## 1. Estado de Fases Documentales (Pre-Implementación)

| Fase | Descripción | Entregables | Estado |
|---|---|---|---|
| Fase 0 & 1 | Reconstrucción, investigación de 7 repos Dojo, APIs CR/Cloudflare/Clairic y State of the Art | `docs/RESEARCH_LOG.md`, `docs/01-research/technical-landscape.md` | **Completado** |
| Fase 2 | Visión, personas, 18 casos de uso, glosario, SRS (89 requisitos) y prioridades MoSCoW | `docs/02-product/*`, `docs/03-requirements/*` | **Completado** |
| Fase 3 | Arquitectura, principios, componentes, pipeline, despliegue, C4 + 9 secuencias y 15 ADRs | `docs/04-architecture/*`, `docs/04-architecture/ADR/*` | **Completado** |
| Fase 4 | Modelo de dominio, ERD, DDL PostgreSQL 16+, procedencia, reconciliación, migración y versionado | `docs/05-data/*` | **Completado** |
| Fase 5 | Contratos públicos, `CR API Passport`, CLI, MCP, versionado y 3 contratos de ejemplo | `docs/06-interfaces/*`, `docs/06-interfaces/contracts/*` | **Completado** |
| Fase 6 | Threat model (18 amenazas STRIDE/OWASP), requisitos MVP vs prod, privacidad Ley 8968 y recuperación | `docs/07-security/*` | **Completado** |
| Fase 7 | Estrategia de pruebas, matriz `T-*`, 18 `AT-*`, 7 quality gates y 25 escenarios `Factura CI` | `docs/08-quality/*` | **Completado** |
| Fase 8 | Matrices de trazabilidad (89 requisitos, 18 riesgos, 15 ADRs) | `docs/09-traceability/*` | **Completado** |
| Fase 9 | Developer Experience (DX), flujos `OficiOS` y especificaciones de interfaz | `docs/10-experience/*` | **Completado** |
| Fase 10 & 11 | Plan MVP, roadmap, backlog (`US-001`..`US-032`), DAG, releases, DoD y estrategia de producto | `docs/11-implementation/*`, `docs/12-product-strategy/*` | **Completado** |
| Fase 12 | Índices raíz (`/docs/*.md`) y auditoría transversal de consistencia | `docs/README.md`, `docs/13-review/*` | **Completado** |

---

## 2. Tablero de Avance de Implementación (Slices 1–7)

| Slice | Alcance | Historias | Paquetes WBS | Estado |
|---|---|---|---|---|
| **Slice 1** | Bootstrap Monorepo, `@quimera/core`, CAS local, DDL `qum_*`, Importador CSV | `US-001`..`US-005` | `WBS-1.1`..`WBS-1.5` (Oleadas 0–1) | Implementado. `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test` 128 pruebas. |
| **Slice 2** | Importadores XLSX + XML FE 4.4 (`hacienda-sdk`), Idempotencia y `demo-hvac-1000` | `US-006`..`US-008` | `WBS-2.1`..`WBS-2.3` (Oleada 2 — Carril A) | `loadDemoHvac1000` lee los archivos y `reconcileDetect` deja 40/12/7/3/1. |
| **Slice 3** | Perfilador, 10 reglas de reconciliación, decisiones, carga PG y `@quimera/pipeline` | `US-009`..`US-013` | `WBS-3.1`..`WBS-3.5` (Oleada 3 — Carril A) | Motor de reconciliación, decisiones inmutables, `migrateVerified` y DAG con exit code 3 cubiertos por pruebas. |
| **Slice 4** | `@quimera/cr-api-passport` (3 pasaportes, rate limit, caché, `verify`, MCP) | `US-014`..`US-017` | `WBS-4.1`..`WBS-4.4` (Oleada 2 — Carril B) | Modo fixture, rate limit, caché y MCP cubiertos por la suite del paquete. |
| **Slice 5** | `apps/oficios` (`hvac-refrigeration-v1`, API Hono, RBAC, procedencia, UI) | `US-018`..`US-020`, `US-026` | `WBS-5.1`..`WBS-5.4` (Oleada 4) | API Hono (409, CAByS por pasaporte en fixture, un `FiscalIntent`) y UI React/Vite/Tailwind en `apps/oficios/web`. |
| **Slice 6** | `@quimera/fiscal-outbox`, `@quimera/factura-ci` (25 escenarios) y `apps/demo-pos` | `US-021`..`US-025` | `WBS-6.1`..`WBS-6.5` (Oleada 2 — Carril C) | CLI `demo-pos`: buggy exit 1 (incluye FC-017 y FC-031); outbox exit 0, 25/25. |
| **Slice 7** | Aislamiento por paquete, seguridad transversal y `pnpm demo:verify` | `US-027`..`US-028` | `WBS-7.1`..`WBS-7.2` (Oleada 5) | `pnpm test:isolation` 0, `pnpm test:security` 17/17, `QUIMERA_AI_ENABLED=false pnpm demo:verify` 0. `pnpm audit --audit-level=high` sigue en rojo por transitivas (ver residuales). |

## 3. Verificación de esta corrida (2026-11-21)

- `pnpm typecheck`: exit 0 (9 paquetes, incluye `@quimera/adapter-clairic`).
- `pnpm lint`: exit 0.
- `pnpm test`: exit 0, 63 archivos, 152 pruebas.
- `pnpm test:isolation`: exit 0. Ningún paquete del núcleo ni OficiOS importa `@quimera/adapter-clairic`.
- `pnpm test:security`: exit 0, 17 pruebas.
- `QUIMERA_AI_ENABLED=false pnpm demo:verify`: exit 0.

## 4. Post-MVP (`WBS-8`)

- `WBS-8.1`: `@quimera/adapter-clairic` es un stub determinista. Rechaza más de 4 imágenes, archivos mayores a 4 MiB o un total mayor a 8 MiB, y URLs remotas (`ERR_CLAIRIC_PAYLOAD_LIMIT`). `confidence` menor a 0.90 abre `AI_LOW_CONFIDENCE`. El texto de prompt injection queda como dato y no aprueba nada. 11 pruebas.
- `WBS-8.2`: `JsonSourceImporter` y `SqliteSourceImporter` implementan `SourceImporterPort`. 5 pruebas `T-DATA-014`. El motor de reconciliación no se modificó.
- `WBS-8.3`: `notifyWorkOrderEvent` queda desactivado salvo `QUIMERA_WHATSAPP_ENABLED=true`. Sin token responde `ERR_OFI_WHATSAPP_NOT_CONFIGURED` y no envía nada. No aprueba ni cierra órdenes.
- `WBS-8.4`: el pasaporte `cr.snit.geodata` es `public_ogc`, sin operaciones inventadas ni red en fixture. `marketplace/quimera-skill.yaml` declara el baseline con `QUIMERA_AI_ENABLED=false` y Clairic como paquete opcional.

## 5. Residuales

- `pnpm audit --audit-level=high` sigue en rojo por `tinypool` (transitiva de Vitest) y `drizzle-orm` anterior a 0.45.2. No se forzó un override.
