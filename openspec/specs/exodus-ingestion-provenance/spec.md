# exodus-ingestion-provenance Specification

## Purpose

Describe la importación segura de formatos heterogéneos, la persistencia con procedencia en PostgreSQL (`qum_*`) bajo Row-Level Security y la consulta de trazabilidad.

## Requirements

### Requirement: Los importadores rechazan entradas hostiles y evitan pérdida silenciosa

Los importadores CSV, XLSX, XML FE 4.4, JSON y SQLite SHALL implementar el contrato `SourceImporterPort`, rechazar entidades externas XML (XXE), neutralizar prefijos de fórmula en exportaciones CSV y registrar cada fila procesada sin descartar registros en silencio.

#### Scenario: Un XML con declaración DOCTYPE o entidad externa es rechazado

- **WHEN** el importador XML recibe un documento con payload XXE
- **THEN** rechaza el archivo antes de expandirlo y no lee recursos locales

#### Scenario: Celdas potencialmente ejecutables en hojas de cálculo se neutralizan al exportar

- **WHEN** un valor comienza con `=`, `+`, `-` o `@` y pasa por la neutralización CSV
- **THEN** el valor se escapa para evitar ejecución de fórmulas en hojas de cálculo

### Requirement: La persistencia en tablas qum_* aplica aislamiento multi-tenant por RLS

El esquema `qum_*` SHALL habilitar `ENABLE` y `FORCE ROW LEVEL SECURITY` en PostgreSQL 16 de modo que, bajo un rol de aplicación `NOSUPERUSER NOBYPASSRLS`, un tenant no pueda leer ni mutar filas pertenecientes a otro tenant.

#### Scenario: Tenant A no observa registros del Tenant B

- **WHEN** se consultan tablas `qum_*` con el contexto de sesión fijado en el tenant A mientras existen filas del tenant B
- **THEN** la consulta devuelve cero filas del tenant B

### Requirement: Cada entidad migrada conserva procedencia verificable hasta archivo y fila

La carga verificada hacia `OficiOS` SHALL registrar el archivo origen y el número de fila en `qum_provenance_entries` y `qum_artifacts`, permitiendo reconstruir el linaje mediante `trace` y manteniendo idempotencia al repetir la carga.

#### Scenario: Repetir la carga del fixture no duplica clientes y conserva su origen

- **WHEN** se ejecuta la persistencia de `demo-hvac-1000` dos veces para el mismo tenant
- **THEN** el conteo de clientes no se duplica y cada cliente conserva su referencia al archivo y fila de origen
