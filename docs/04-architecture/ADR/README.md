# Índice de Architecture Decision Records (ADRs) — QUIMERA

- **Directorio:** `docs/04-architecture/ADR/`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21

| ID | Título | Estado | Componentes afectados |
|---|---|---|---|
| [`ADR-001`](./ADR-001-monorepo-modular.md) | Monorepo modular (`pnpm` + Turborepo) vs. repositorios independientes | Aceptada | Todos |
| [`ADR-002`](./ADR-002-primary-language.md) | Lenguaje principal TypeScript-first (Node 22+ ESM) con puerta aislada para Python opcional | Aceptada | Todos |
| [`ADR-003`](./ADR-003-postgresql-primary-store.md) | PostgreSQL 16+ como almacén principal transaccional, de procedencia y outbox | Aceptada | Data Exodus, Fiscal Outbox, Pipeline, OficiOS |
| [`ADR-004`](./ADR-004-immutable-evidence-storage.md) | Almacenamiento inmutable content-addressed (`ArtifactStorePort` SHA-256) | Aceptada | Core, Data Exodus, Fiscal Outbox, OficiOS |
| [`ADR-005`](./ADR-005-provenance-model.md) | Modelo de procedencia a nivel de registro y campo (Ledger append-only) | Aceptada | Core, Data Exodus, OficiOS |
| [`ADR-006`](./ADR-006-conflict-reconciliation-model.md) | Modelo de conflictos y reconciliación asistida con decisiones inmutables (`SUPERSEDES`) | Aceptada | Core, Data Exodus |
| [`ADR-007`](./ADR-007-intermodule-contracts.md) | Contratos tipados entre módulos con Zod v4 y exportación a JSON Schema Draft 2020-12 | Aceptada | Todos |
| [`ADR-008`](./ADR-008-pipeline-design.md) | Motor de pipelines DAG acíclico determinista con checkpoints y semántica at-least-once + idempotencia | Aceptada | Pipeline, Data Exodus |
| [`ADR-009`](./ADR-009-mcp-selective-adoption.md) | Uso selectivo de MCP (spec `2026-07-28` stateless/stdio) y rechazo de Code Mode en MVP | Aceptada | CR API Passport, Data Exodus |
| [`ADR-010`](./ADR-010-fiscal-testing-and-outbox-boundaries.md) | Límites entre `@dojocoding/hacienda-sdk`, Fiscal Outbox y Factura CI | Aceptada | Fiscal Outbox, Factura CI |
| [`ADR-011`](./ADR-011-oficios-separation.md) | Separación arquitectónica estricta de OficiOS como aplicación consumidora | Aceptada | Core, OficiOS |
| [`ADR-012`](./ADR-012-clairic-isolation.md) | Aislamiento estricto de Clairic detrás de `StructuredExtractorPort` opcional | Aceptada | Core, Adapter Clairic, Data Exodus |
| [`ADR-013`](./ADR-013-deployment-strategy.md) | Estrategia de despliegue local-first (Node 22 + PG) y adopción diferida de Cloudflare | Aceptada | Todos |
| [`ADR-014`](./ADR-014-extensibility-strategy.md) | Extensibilidad mediante Ports & Adapters y registro declarativo de capacidades | Aceptada | Core, Data Exodus, CR API Passport, Pipeline |
| [`ADR-015`](./ADR-015-data-and-contract-versioning.md) | Política de versionado SemVer para paquetes, contratos, pasaportes y esquemas de BD | Aceptada | Todos |
