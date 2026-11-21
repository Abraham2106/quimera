# Estrategia de Versionado de Esquemas y Evolución de Datos — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [ADR-015](../04-architecture/ADR/ADR-015-data-and-contract-versioning.md) | [Política de Versionado de Interfaces](../06-interfaces/versioning-policy.md)

---

## 1. Tres Capas de Esquemas en QUIMERA

| Capa | Qué define | Dónde vive | Cómo se versiona |
|---|---|---|---|
| **1. Esquema Físico PostgreSQL** | Tablas `qum_*`, `fob_*`, `ofi_*`, columnas, índices, RLS | `packages/*/drizzle/*.sql` | Migraciones SQL secuenciales inmutables (`0001_init.sql`, `0002_...sql`) |
| **2. Esquema Canónico / Destino (`TargetSchema`)** | Estructura esperada de entidades normalizadas (ej. `exodus-canonical`, `oficios-v1`) | Código Zod + JSON Schema exportado + tabla `qum_schema_versions` | SemVer (`MAJOR.MINOR.PATCH`) + `sha256` del JSON Schema |
| **3. Esquemas Externos** | Formatos oficiales ajenos a QUIMERA (ej. Hacienda FE `4.4`, respuestas BCCR SDDE) | Manifiestos de `CR API Passport` + `@dojocoding/hacienda-sdk` | `upstreamSpecRef` + `passportVersion` (SemVer) |

---

## 2. Reglas de Compatibilidad de `TargetSchema`

| Tipo de cambio | Incremento SemVer | Compatibilidad con datos históricos | Acción requerida |
|---|---|---|---|
| Corrección de descripción o regex no restrictivo | `PATCH` (1.0.x) | Compatible hacia atrás y adelante | Ninguna migración de datos |
| Agregar campo **opcional** o nuevo valor de `enum` aditivo | `MINOR` (1.x.0) | Compatible hacia atrás; registros antiguos siguen siendo válidos al leerse | Registrar nueva fila en `qum_schema_versions`; soporte lectura `N-1` automático |
| Renombrar/eliminar campo, cambiar tipo o hacer obligatorio un campo antes opcional | `MAJOR` (x.0.0) | **Incompatible** | Requiere patrón **Expand-and-Contract** y función de migración `upcaster` explícita versionada |

---

## 3. Patrón Expand-and-Contract para PostgreSQL

Nunca se ejecutan migraciones destructivas en un solo paso en producción:
1. **Expand:** Se agrega la nueva columna/tabla opcional manteniendo la anterior; el código escribe en ambas o lee con fallback.
2. **Backfill:** Proceso idempotente por lotes rellena los datos históricos registrando la transformación en `qum_provenance_entries`.
3. **Contract:** En una versión posterior (tras ventana de soporte N-1), se remueve la columna obsoleta.

---

## 4. Preservación de Procedencia Multi-Versión

- Cada fila en `qum_import_batches`, `qum_entities` y `qum_provenance_entries` referencia `schema_version_id`.
- Las filas de `qum_schema_versions` son **inmutables**: jamás se modifica el `json_schema` de una versión ya usada en una importación.
- Cuando un auditor consulta una entidad migrada hace 2 años bajo `oficios-v1@1.0.0` aunque el sistema opere en `oficios-v1@2.0.0`, QUIMERA conoce el esquema exacto bajo el cual se validó originalmente y cualquier transformación `upcaster` posterior.

---

## 5. Verificación Automatizada en CI

1. **Bloqueo de edición de migraciones pasadas:** CI verifica que ningún archivo `.sql` ya fusionado en `main` haya sido modificado.
2. **Prueba de migración limpia:** Cada PR ejecuta las migraciones desde cero sobre PostgreSQL 16 efímero.
3. **Prueba de compatibilidad de esquema (`QR-NFR-012`):** Los cambios en `TargetSchema` corren contra fixtures de la versión `N-1` para detectar rupturas accidentales sin bump `MAJOR`.
