# Resumen de Decisiones Arquitectónicas — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Detalle completo:** [`docs/04-architecture/ADR/`](./04-architecture/ADR/README.md) | [`docs/09-traceability/architecture-decision-matrix.md`](./09-traceability/architecture-decision-matrix.md)

---

## Las 5 Decisiones Arquitectónicas Más Importantes

1. **Reutilizar `@dojocoding/hacienda-sdk@0.13.0` y especializar `Fiscal Outbox` + `Factura CI` (`ADR-010`):** La inspección del código fuente reveló que `hacienda-sdk/delivery` ya implementa `DocumentStore`, `VALID_TRANSITIONS`, `classifySendResult` y validadores FE 4.4. Por tanto, QUIMERA **no reescribe** nada del SDK: `Fiscal Outbox` aporta `PgDocumentStore` transaccional + consecutivos atómicos por `issuerId` + worker `SKIP LOCKED`, y `Factura CI` prueba apps completas (SUT) en loopback con inyección de fallos.
2. **Baseline 100% libre de IA con aislamiento total de `@quimera/adapter-clairic` (`ADR-012`):** Dado que Clairic en Cloudflare Workers AI está en preview «AS IS / AS AVAILABLE» y su ejecución local requiere GPU CUDA 27B, todo el núcleo funciona sin IA ni GPU; Clairic vive únicamente detrás de `StructuredExtractorPort` con compuerta humana obligatoria.
3. **PostgreSQL 16+ + CAS `SHA-256` como única columna vertebral de integridad (`ADR-003`, `ADR-004`, `ADR-005`):** Permite transacciones ACID para migraciones, reconciliación, procedencia append-only, aislamiento multi-tenant (RLS), checkpoints de pipeline y secuencias fiscales sin levantar infraestructura distribuida pesada.
4. **Separación estricta de `apps/oficios` como consumidor puro (`ADR-011`):** Ningún paquete bajo `packages/*` puede importar `apps/oficios`. El esquema `oficios-v1` es solo un `TargetSchema` declarativo más, preservando el carácter reutilizable del toolkit.
5. **Política conservadora de reconciliación y exclusión de dependencias inadecuadas (`ADR-006`, `RESEARCH_LOG.md`):** Nunca fusionar duplicados probables ni contradicciones automáticamente; se rechaza usar `claude-code-waypoint` como persistencia de reconciliación (requiere ACID, no Markdown) y se excluye `make-no-mistakes-toolkit` por su licencia **BSL 1.1**.

---

## Catálogo Completo de ADRs (`ADR-001`..`ADR-015`)

| ID | Título | Estado | Decisión resumida |
|---|---|---|---|
| [`ADR-001`](./04-architecture/ADR/ADR-001-monorepo-modular.md) | Monorepo vs Polyrepo | Aceptada | Monorepo modular (`pnpm` workspaces + Turborepo + Changesets) con paquetes `@quimera/*` publicables e instalables independientemente. |
| [`ADR-002`](./04-architecture/ADR/ADR-002-primary-language.md) | Lenguaje y Runtime Principal | Aceptada | TypeScript (`strict`, ESM) sobre Node.js 22.13+; Python reservado solo para workers ML aislados post-MVP si hiciera falta. |
| [`ADR-003`](./04-architecture/ADR/ADR-003-postgresql-primary-store.md) | PostgreSQL como Almacén Primario | Aceptada | PostgreSQL 16+ con Drizzle ORM, migraciones SQL inmutables y RLS multi-tenant. |
| [`ADR-004`](./04-architecture/ADR/ADR-004-immutable-evidence-storage.md) | Almacenamiento de Evidencia (CAS) | Aceptada | `ArtifactStorePort` content-addressed por `SHA-256` (FS local en MVP, S3/R2 con Object Lock WORM en prod). |
| [`ADR-005`](./04-architecture/ADR/ADR-005-provenance-model.md) | Modelo de Procedencia | Aceptada | Tablas append-only `qum_provenance_entries` distinguiendo explícitamente hash, firma, autenticidad y linaje. |
| [`ADR-006`](./04-architecture/ADR/ADR-006-conflict-reconciliation-model.md) | Modelo de Conflictos y Reconciliación | Aceptada | 10 tipos de conflicto; solo `EXACT_DUPLICATE` es automático; ambigüedades bloquean hasta `ResolutionDecision` humana inmutable. |
| [`ADR-007`](./04-architecture/ADR/ADR-007-intermodule-contracts.md) | Contratos entre Módulos | Aceptada | Zod v4 como fuente única + exportación JSON Schema Draft 2020-12 + sobre `QuimeraError`. |
| [`ADR-008`](./04-architecture/ADR/ADR-008-pipeline-design.md) | Diseño del Pipeline | Aceptada | Motor DAG declarativo ligero embebible con checkpoints PG, compuerta humana (`exit 3`) y semántica `at-least-once` + idempotencia. |
| [`ADR-009`](./04-architecture/ADR/ADR-009-mcp-selective-adoption.md) | Adopción Selectiva de MCP | Aceptada | MCP read-only/verify (`stdio` + HTTP stateless spec `2026-07-28`) solo en `CR API Passport` (Should); sin Cloudflare Code Mode en MVP; prohibido firmar vía MCP. |
| [`ADR-010`](./04-architecture/ADR/ADR-010-fiscal-testing-and-outbox-boundaries.md) | Pruebas Fiscales y Límites de Outbox | Aceptada | `hacienda-sdk` (primitivos/delivery) + `Fiscal Outbox` (PG transaccional/secuencias) + `Factura CI` (harness SUT loopback con inyección de fallos). |
| [`ADR-011`](./04-architecture/ADR/ADR-011-oficios-separation.md) | Separación de OficiOS | Aceptada | `apps/oficios` como consumidor puro con `TargetSchema` declarativo y regla ESLint/CI bloqueando imports inversos. |
| [`ADR-012`](./04-architecture/ADR/ADR-012-clairic-isolation.md) | Aislamiento de Clairic | Aceptada | `@quimera/adapter-clairic` opcional detrás de `StructuredExtractorPort`, jamás en `dependencies` del núcleo, con compuerta humana en baja confianza o campos fiscales. |
| [`ADR-013`](./04-architecture/ADR/ADR-013-deployment-strategy.md) | Estrategia de Despliegue | Aceptada | Local-First (Node 22 + PostgreSQL 16 / Docker Compose); Cloudflare R2/Workers/Workflows solo donde aporte valor verificado post-MVP. |
| [`ADR-014`](./04-architecture/ADR/ADR-014-extensibility-strategy.md) | Estrategia de Extensibilidad | Aceptada | Ports & Adapters + registros estáticos + manifiestos YAML/JSON declarativos validados por Zod (cero `eval`). |
| [`ADR-015`](./04-architecture/ADR/ADR-015-data-and-contract-versioning.md) | Versionado de Datos y Contratos | Aceptada | 4 ejes SemVer desacoplados (paquetes, contratos, pasaportes, esquemas BD), soporte `N-1` y Expand-and-Contract. |
