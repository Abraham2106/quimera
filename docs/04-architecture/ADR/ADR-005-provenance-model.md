# ADR-005: Modelo de Procedencia a Nivel de Registro y Campo (Ledger Append-Only)

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-DATA-011`, `QR-CORE-001`, `QR-OFI-004`, `QR-NFR-002`, `QR-SEC-005`

## Contexto
La propuesta diferenciadora de Data Exodus es responder preguntas concretas como: *«¿De qué documentos, filas, reglas y decisiones humanas salió el saldo de ₡85.000 de este cliente?»*.

## Problema
Diseñar un modelo de procedencia suficientemente granular para responder a nivel de entidad y campo crítico, pero suficientemente simple y rápido para no requerir un grafo RDF/Neo4j ni Event Sourcing completo.

## Alternativas evaluadas
1. **Tabla relacional `append-only` `provenance_entries` en PostgreSQL** vinculando `(entity_type, entity_id, field_name?) → (raw_record_id, artifact_id, transformation_rule_id, resolution_decision_id, schema_version, origin_kind)`.
2. **Adoptar OpenLineage + Marquez (JVM)** como servidor de linaje externo.
3. **Guardar solo un campo `source_file` en cada tabla destino.**

## Criterios de decisión
Granularidad a nivel de registro/campo, rendimiento de consulta (`≤150 ms p95`), simplicidad operativa y distinción clara entre integridad criptográfica (hash) y procedencia semántica.

## Evidencia relevante
- OpenLineage/Marquez resuelve linaje dataset/job pero exige infraestructura JVM adicional y no modela aprobaciones humanas de conflictos por fila.
- Un solo campo `source_file` pierde trazabilidad cuando una entidad es resultado de fusionar 3 archivos (Excel + CSV + XML).
- Un hash `SHA-256` demuestra únicamente que los bytes del archivo no cambiaron desde la ingestión; **no demuestra autenticidad ni veracidad del contenido**. La procedencia completa exige enlazar bytes + localizador + regla + decisión humana.

## Decisión
Implementar un **Ledger de Procedencia `append-only` en PostgreSQL (`provenance_entries`)**, indexado por `(tenant_id, entity_type, entity_id)` y `(tenant_id, raw_record_id)`, compatible conceptualmente con entidades Run/Dataset de OpenLineage y que distingue explícitamente `origin_kind` (`DETERMINISTIC_PARSE`, `AUTO_RULE`, `HUMAN_DECISION`, `AI_EXTRACTION`).

## Consecuencias
- **Positivas:** Consultas SQL directas y rápidas en OficiOS y reportes de auditoría; soporta fusión N-a-1 (varios archivos alimentando una entidad) y trazabilidad hacia adelante (qué entidades dependen de un archivo).
- **Negativas:** Crecimiento lineal de la tabla `provenance_entries` (estimado 1–5 filas por entidad/evento de migración; fácilmente particionable por `tenant_id` o `created_at` en escala).

## Riesgos
- **Riesgo:** Sobre-registrar metadatos por cada columna trivial y degradar velocidad de carga.
- **Mitigación:** En MVP registrar procedencia a nivel de entidad completa (`field_name IS NULL`) y a nivel de campo únicamente para campos conflictivos/resueltos o financieros críticos (`tax_id`, `balance`, `total_amount`).

## Condiciones de revisión
Si el volumen de `provenance_entries` supera decenas de millones de filas en una instancia multi-tenant, aplicar particionamiento declarativo PostgreSQL por `tenant_id` o fecha y archivado en frío.
