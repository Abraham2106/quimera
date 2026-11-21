# Revisión Crítica de Arquitectura — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Revisión completada previo a implementación del Slice 1
- **Referencias:** [Arquitectura de Software](../04-architecture/software-architecture.md) | [Decisiones](../DECISIONS.md) | [Auditoría de Consistencia](./document-consistency-audit.md)

---

## 1. Propósito de la Revisión

Esta revisión evalúa de manera crítica e independiente la arquitectura diseñada para QUIMERA, verificando que la propuesta no caiga en sobreingeniería, acoplamiento oculto, duplicación con herramientas maduras ni promesas irrealistas sobre IA o infraestructura distribuida.

---

## 2. Evaluación de Criterios Arquitectónicos Críticos

| Criterio de Revisión | Veredicto | Evidencia en el Diseño |
|---|---|---|
| **1. ¿El baseline opera 100% sin IA ni GPU?** | **Aprobado** | `@quimera/adapter-clairic` vive detrás de `StructuredExtractorPort`, fuera de `dependencies` del núcleo (`ADR-012`), validado por `T-CORE-004` y `T-CLAI-001`. |
| **2. ¿`OficiOS` es consumidor puro y no dependencia del Core?** | **Aprobado** | Ubicado en `apps/oficios`, esquema `oficios-v1` declarado como `TargetSchema` genérico y protegido por regla ESLint/CI (`ADR-011`, `T-OFI-001`). |
| **3. ¿Se evitaron microservicios y orquestadores pesados innecesarios?** | **Aprobado** | Monorepo modular TypeScript + PostgreSQL 16 + motor DAG embebible (`ADR-001`, `ADR-003`, `ADR-008`). Se rechazaron explícitamente Airflow, Temporal, NiFi y microservicios en el MVP. |
| **4. ¿Se evitó reinventar software maduro del ecosistema Dojo?** | **Aprobado** | Se reutiliza `@dojocoding/hacienda-sdk@0.13.0` (incluyendo `delivery`, `DocumentStore`, `VALID_TRANSITIONS`, `parseDocumentXml`). Se descartó `claude-code-waypoint` como persistencia de datos y se excluyó `make-no-mistakes-toolkit` por licencia BSL 1.1 (`RESEARCH_LOG.md`). |
| **5. ¿Se evitó prometer *exactly-once* mágico?** | **Aprobado** | Tanto `@quimera/pipeline` como `@quimera/fiscal-outbox` declaran explícitamente semántica **`at-least-once` + idempotencia** (`ADR-008`, `ADR-013`) y documentan la limitación real de Cloudflare Queues/Workflows. |
| **6. ¿Cada módulo funciona de forma independiente?** | **Aprobado** | `CR API Passport` y `Factura CI` no requieren PostgreSQL; `@quimera/core` solo depende de `zod`; `T-CORE-003` valida empaquetado e instalación aislada. |
| **7. ¿La complejidad del modelo de datos es proporcional al MVP?** | **Aprobado con observación** | Se unificaron `File`/`Attachment` en `qum_artifacts` y `Transformation`/`ProvenanceEdge` en `qum_provenance_entries` (`domain-model.md`). **Observación:** vigilar en implementación que `qum_entities` + `TargetSchema` no agregue boilerplate excesivo en el Slice 3; mantener `oficios-v1` simple. |
| **8. ¿Son honestas las garantías de seguridad MVP vs Producción?** | **Aprobado** | `security-requirements.md` y `quality-gates.md` (`QG-07`) separan explícitamente lo activo en MVP (local/mock) de lo exigible antes de operar certificados `.p12` reales y datos PYME en producción (RLS forzado, KMS, WORM 5 años, PITR). |

---

## 3. Riesgos Arquitectónicos Residuales a Monitorear Durante Implementación

1. **Acoplamiento sutil al esquema `oficios-v1` dentro de `Data Exodus` (`RSK-008`):** Durante la presión del hackathon es tentador escribir lógica específica de talleres en el cargador destino. Mitigación: mantener el adaptador de destino en un archivo de definición declarativa (`targetSchemas/oficios-v1.ts`) y añadir una prueba con un segundo `TargetSchema` mínimo (`generic-crm-v1`) en `T-DATA-013`.
2. **Rendimiento de consultas de linaje en `qum_provenance_entries` (`QR-NFR-002`):** Verificar en Slice 7 con `EXPLAIN ANALYZE` que el índice `(tenant_id, entity_id, field_path)` satisface el objetivo hipotético ≤ 150 ms p95 con 100k filas.
3. **Evolución de `@dojocoding/hacienda-sdk` pre-1.0 (`RSK-004`):** Encapsular todas las importaciones del SDK en un módulo adaptador interno en `data-exodus`, `fiscal-outbox` y `factura-ci` para aislar futuros cambios de API menor.
