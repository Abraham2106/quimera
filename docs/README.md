# Documentación de Ingeniería — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Diseño integral completo y auditado — Listo para iniciar implementación del Slice 1
- **Principio rector:** Toolkit modular tipo Apache para rescatar datos dispersos, verificar APIs costarricenses, operar procesos empresariales y probar software fiscal **sin depender de IA ni GPU en el baseline**.

---

## Documentos de Control en Raíz (`/docs`)

| Documento | Propósito | Estado |
|---|---|---|
| [`docs/README.md`](./README.md) | Índice maestro y mapa de relaciones entre artefactos | Vigente |
| [`docs/RESEARCH_LOG.md`](./RESEARCH_LOG.md) | Registro verificable de fuentes primarias (7 repos DojoCodingLabs + APIs CR + Cloudflare/Clairic + Caricaco + Hackathon) | Completo |
| [`docs/DECISIONS.md`](./DECISIONS.md) | Resumen ejecutivo de las 15 decisiones arquitectónicas (`ADR-001`..`ADR-015`) | Vigente |
| [`docs/ASSUMPTIONS.md`](./ASSUMPTIONS.md) | Catálogo explícito de supuestos e hipótesis medibles (`[HIPÓTESIS]`) | Vigente |
| [`docs/OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) | Cuestiones pendientes de decisión humana o validación de campo | Vigente |
| [`docs/IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) | Estado de preparación documental y avance por vertical slice | Fase 0–12 documentadas; 0 código producto |

---

## Mapa Completo de Entregables por Fase

### Fase 1 — Investigación Técnica (`docs/01-research/`)
- [`technical-landscape.md`](./01-research/technical-landscape.md) — State of the Art, auditoría de los 7 repos de DojoCodingLabs, patrones evaluados, comparación de tecnologías y análisis de diferenciación real.

### Fase 2 — Producto y Requisitos (`docs/02-product/` y `docs/03-requirements/`)
- [`product-vision.md`](./02-product/product-vision.md) — Visión, objetivos `OBJ-01`..`OBJ-06`, qué es y qué NO es QUIMERA.
- [`stakeholders-and-personas.md`](./02-product/stakeholders-and-personas.md) — 10 stakeholders (`STK-01`..`STK-10`), necesidades y conflictos de interés.
- [`use-cases.md`](./02-product/use-cases.md) — 18 casos de uso verificables (`UC-01`..`UC-18`).
- [`domain-glossary.md`](./02-product/domain-glossary.md) — Terminología canónica compartida.
- [`SRS.md`](./03-requirements/SRS.md) — Especificación de Requisitos de Software alineada con buenas prácticas ISO/IEC/IEEE 29148.
- [`requirements-catalog.md`](./03-requirements/requirements-catalog.md) — Catálogo normativo con **89 requisitos verificables** (`QR-*`).
- [`scope-and-priorities.md`](./03-requirements/scope-and-priorities.md) — Priorización MoSCoW separando MVP obligatorio, MVP opcional, post-hackathon y fuera de alcance.

### Fase 3 — Arquitectura de Software (`docs/04-architecture/`)
- [`architectural-principles.md`](./04-architecture/architectural-principles.md) — 10 principios arquitectónicos (`AP-01`..`AP-10`).
- [`software-architecture.md`](./04-architecture/software-architecture.md) — Modelo arquitectónico, procesos, monorepo modular y dependencias permitidas/prohibidas.
- [`component-design.md`](./04-architecture/component-design.md) — Límites, responsabilidades, contratos, errores, persistencia e independencia de los 8 componentes.
- [`pipeline-architecture.md`](./04-architecture/pipeline-architecture.md) — Motor DAG determinista, checkpoints, reanudación, compuerta humana y semántica `at-least-once`.
- [`deployment-architecture.md`](./04-architecture/deployment-architecture.md) — Despliegue Local-First (Node 22 + PostgreSQL 16) y adopción selectiva diferida de Cloudflare.
- [`C4.md`](./04-architecture/C4.md) — Diagramas C4 (Context, Containers, Components) y los 9 diagramas de secuencia críticos.
- [`ADR/README.md`](./04-architecture/ADR/README.md) — Índice de los 15 Architecture Decision Records (`ADR-001` a `ADR-015`).

### Fase 4 — Diseño de Datos (`docs/05-data/`)
- [`domain-model.md`](./05-data/domain-model.md) — Modelo de dominio unificado e invariantes `INV-01`..`INV-05`.
- [`ERD.md`](./05-data/ERD.md) — Diagramas ERD Mermaid para `qum_*`, `fob_*` y `ofi_*`.
- [`database-design.md`](./05-data/database-design.md) — DDL PostgreSQL 16+, índices, políticas RLS, políticas de eliminación y recuperación.
- [`data-provenance.md`](./05-data/data-provenance.md) — Linaje completo y distinción rigurosa entre hash, firma, autenticidad y procedencia.
- [`reconciliation-model.md`](./05-data/reconciliation-model.md) — Las 10 estrategias de reconciliación y reglas de automatización vs revisión humana.
- [`data-migration-strategy.md`](./05-data/data-migration-strategy.md) — Flujo de 5 etapas, garantías contra las 7 fallas prohibidas, `--dry-run` e informe de conciliación.
- [`schema-versioning.md`](./05-data/schema-versioning.md) — Versionado en 3 capas y patrón Expand-and-Contract.

### Fase 5 — Interfaces y Contratos (`docs/06-interfaces/`)
- [`public-contracts.md`](./06-interfaces/public-contracts.md) — Matriz de interfaces y tipos canónicos TypeScript/Zod.
- [`api-passport-design.md`](./06-interfaces/api-passport-design.md) — Catálogo verificado de APIs CR (Hacienda, BCCR SDDE, SNIT, Correos CR), cuotas y deriva.
- [`CLI-design.md`](./06-interfaces/CLI-design.md) — Comandos CLI, `--json` limpio y exit codes semánticos (`0/1/2/3/4/5`).
- [`MCP-design.md`](./06-interfaces/MCP-design.md) — Adopción selectiva de MCP (spec `2026-07-28`, solo lectura/verificación, seguridad).
- [`versioning-policy.md`](./06-interfaces/versioning-policy.md) — SemVer en 4 ejes, soporte N-1, deprecación y capabilities discovery.
- Contratos de ejemplo ejecutables: [`core-contracts.schema.json`](./06-interfaces/contracts/core-contracts.schema.json), [`passport-hacienda-cabys.yaml`](./06-interfaces/contracts/passport-hacienda-cabys.yaml), [`pipeline-exodus-oficios.yaml`](./06-interfaces/contracts/pipeline-exodus-oficios.yaml).

### Fase 6 — Seguridad y Confiabilidad (`docs/07-security/`)
- [`threat-model.md`](./07-security/threat-model.md) — Análisis STRIDE + OWASP de 18 amenazas (`TH-01`..`TH-18`).
- [`security-requirements.md`](./07-security/security-requirements.md) — Controles `QR-SEC-001`..`012` separando garantías MVP vs Producción.
- [`privacy-and-data-handling.md`](./07-security/privacy-and-data-handling.md) — Clasificación de datos, Ley 8968 CR y retención fiscal de 5 años.
- [`reliability-and-recovery.md`](./07-security/reliability-and-recovery.md) — Recuperación ante fallos en Exodus, Pipeline, Fiscal Outbox y Passport.

### Fase 7 — Calidad y Pruebas (`docs/08-quality/`)
- [`test-strategy.md`](./08-quality/test-strategy.md) — Estrategia por capas, property-based testing, mutation testing selectivo y fixtures sintéticos.
- [`test-matrix.md`](./08-quality/test-matrix.md) — Catálogo `T-*` enlazado a cada requisito.
- [`acceptance-tests.md`](./08-quality/acceptance-tests.md) — 18 pruebas de aceptación observables (`AT-01`..`AT-18`).
- [`quality-gates.md`](./08-quality/quality-gates.md) — 7 puertas de calidad (`QG-01`..`QG-07`).
- [`failure-scenarios.md`](./08-quality/failure-scenarios.md) — Frontera `hacienda-sdk` vs `Factura CI` y catálogo de 25 escenarios críticos (`FC-001..024` + `FC-031`).

### Fase 8 — Trazabilidad (`docs/09-traceability/`)
- [`requirements-traceability-matrix.md`](./09-traceability/requirements-traceability-matrix.md) — Cobertura 89/89 (100%, 0 requisitos `Must` huérfanos).
- [`risk-traceability-matrix.md`](./09-traceability/risk-traceability-matrix.md) — 18 riesgos (`RSK-001`..`RSK-018`) con mitigación, prueba y riesgo residual.
- [`architecture-decision-matrix.md`](./09-traceability/architecture-decision-matrix.md) — Trazabilidad de los 15 ADRs a requisitos, componentes y riesgos.

### Fase 9 — Experiencia de Usuario y DX (`docs/10-experience/`)
- [`developer-experience.md`](./10-experience/developer-experience.md) — Instalación en ≤5 min, primer pipeline, errores y ergonomía para agentes IA.
- [`oficios-user-flows.md`](./10-experience/oficios-user-flows.md) — Los 9 flujos operativos de `OficiOS` (`hvac-refrigeration-v1`) en español CR.
- [`interface-specifications.md`](./10-experience/interface-specifications.md) — API REST Hono de `OficiOS`, RBAC, bloqueo `409` y contratos UI.

### Fase 10 y 11 — Implementación y Estrategia de Producto (`docs/11-implementation/` y `docs/12-product-strategy/`)
- [`MVP-plan.md`](./11-implementation/MVP-plan.md) — Arquitectura mínima viable, 7 vertical slices, plan de recorte y guión de demo 100% offline.
- [`development-roadmap.md`](./11-implementation/development-roadmap.md) — Evolución por etapas (MVP → Beta → Pilotos → v1.0 → Plugins → LATAM).
- [`implementation-backlog.md`](./11-implementation/implementation-backlog.md) — 28 historias MVP (`US-001`..`US-028`) + 4 post-MVP (`US-029`..`US-032`).
- [`dependency-graph.md`](./11-implementation/dependency-graph.md) — DAG Mermaid, camino crítico y 3 carriles paralelizables.
- [`release-strategy.md`](./11-implementation/release-strategy.md) — Publicación independiente `@quimera/*`, Changesets y rollback.
- [`definition-of-done.md`](./11-implementation/definition-of-done.md) — DoD por historia, slice y MVP.
- [`market-and-competition.md`](./12-product-strategy/market-and-competition.md) — Competencia verificada (Airbyte, Datafold, `mcp-hacienda-cr`, TallerApp, Astra) y Caricaco Ventures.
- [`distribution-and-monetization.md`](./12-product-strategy/distribution-and-monetization.md) — Modelo MIT open core, Dojo Marketplace e hipótesis comerciales.
- [`validation-plan.md`](./12-product-strategy/validation-plan.md) — Experimentos falsables `H-01`..`H-05`.

### Fase 12 — Auditoría y Revisión Final (`docs/13-review/`)
- [`architecture-review.md`](./13-review/architecture-review.md) — Revisión crítica de arquitectura y validación de supuestos.
- [`document-consistency-audit.md`](./13-review/document-consistency-audit.md) — Auditoría transversal automatizada y manual de consistencia.
- [`open-decisions.md`](./13-review/open-decisions.md) — Decisiones pendientes de aprobación formal.
- [`readiness-assessment.md`](./13-review/readiness-assessment.md) — Evaluación de preparación para iniciar implementación (Slice 1).
