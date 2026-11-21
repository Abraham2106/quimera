# ADR-015: Versionado de Datos, Esquemas y Contratos

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-CORE-007`, `QR-NFR-011`, `QR-NFR-012`, `QR-PASS-001`

## Contexto
QUIMERA maneja cuatro dimensiones distintas que evolucionan a ritmos diferentes: (1) paquetes npm (`@quimera/*`), (2) contratos de intercambio entre módulos/pipelines, (3) manifiestos de APIs externas (`ApiPassport`) y (4) esquemas de tablas PostgreSQL y datos históricos ya migrados.

## Problema
Confundir la versión de un paquete con la versión de un esquema de datos o de una API estatal provoca migraciones irrecuperables y ruptura silenciosa de procedencia histórica.

## Alternativas evaluadas
1. **Versionado desacoplado en 4 ejes explícitos bajo Semantic Versioning**, con tabla `schema_versions` en PostgreSQL, migraciones SQL hacia adelante y soporte de lectura N-1.
2. **Una única versión global del repositorio** para todo (paquetes, esquemas, pasaportes y BD).

## Criterios de decisión
Preservación de procedencia histórica (saber qué versión de esquema estaba vigente cuando se migró un dato en 2026), compatibilidad entre módulos independientes y claridad en releases.

## Evidencia relevante
- La versión 4.4 de Hacienda cambió independientemente de las versiones de los clientes; igual ocurre con BCCR SDDE (2025/2026).
- Los registros históricos en `provenance_entries` deben conservar `schema_version_id` exacto para poder auditarse 5 años después aunque el esquema haya evolucionado a `v2`.

## Decisión
Separar explícitamente el versionado en cuatro ejes:
1. **Paquetes npm (`@quimera/*`):** SemVer independiente gestionado con **Changesets** (`0.x` pre-estabilización, `1.0.0+` contrato bloqueado).
2. **Contratos entre módulos y pipelines (`contractVersion`):** SemVer validado estáticamente; `MAJOR` incompatible bloquea ejecución; cambios aditivos opcionales en `MINOR`.
3. **Pasaportes de API (`ApiPassport`):** `passportVersion` (SemVer del contrato) + `upstreamSpecRef` + `lastVerifiedAt`.
4. **Esquemas de datos (`schema_versions` + Drizzle SQL migrations):** Migraciones SQL inmutables solo hacia adelante (expand-and-contract para cambios mayores) y registro de `schema_version` en cada `import_batch`, `normalized_entity` y `provenance_entry`.

## Consecuencias
- **Positivas:** Procedencia intacta a lo largo de años; evolución independiente de pasaportes ante cambios súbitos de Hacienda/BCCR sin romper `@quimera/core`.
- **Negativas:** Disciplina obligatoria de no editar migraciones SQL ya aplicadas ni mutar contratos publicados sin bump de versión.

## Riesgos
- **Riesgo:** Proliferación de versiones antiguas difíciles de mantener.
- **Mitigación:** Política explícita de soporte N-1 y ventana de deprecación documentada en `docs/06-interfaces/versioning-policy.md`.

## Condiciones de revisión
Revisar política de mantenimiento LTS al alcanzar la primera versión pública `v1.0.0` con pilotos en producción.
