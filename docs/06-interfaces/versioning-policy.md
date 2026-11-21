# Política de Versionado, Compatibilidad y Deprecación — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [ADR-015](../04-architecture/ADR/ADR-015-data-and-contract-versioning.md) | [Versionado de Esquemas](../05-data/schema-versioning.md)

---

## 1. Semantic Versioning (SemVer 2.0.0) en Cuatro Ejes

| Eje | Artefacto | Regla `MAJOR` | Regla `MINOR` | Regla `PATCH` |
|---|---|---|---|---|
| **Paquetes npm** | `@quimera/*` | Cambio incompatible en SDK, CLI flags o firma de puertos | Nueva capacidad, comando o campo opcional compatible | Corrección de bugs, docs o mejoras internas |
| **Contratos internos** | `contractVersion` en `QuimeraEnvelope` y pasos de pipeline | Eliminar/renombrar campo requerido o cambiar semántica de estado | Agregar campo opcional o nuevo `ConflictCode` aditivo | Aclaraciones de validación no restrictivas |
| **Pasaportes de API** | `passportVersion` en YAML de `CR API Passport` | Cambio breaking en endpoint oficial, auth o esquema normalizado | Nuevo endpoint opcional o campo adicional en respuesta | Ajuste de metadatos, TTL o fixtures |
| **Esquemas de datos** | `qum_schema_versions` | Cambio estructural que requiere *Expand-and-Contract* + `upcaster` | Campo opcional nuevo compatible con lectura `N-1` | Ajuste documental |

> **Nota pre-1.0:** Durante la fase MVP y Beta Técnica (`0.x.y`), los cambios incompatibles incrementan `0.X.0` y se documentan explícitamente en `CHANGELOG.md` vía Changesets. Al liberar `1.0.0`, entra en vigor la garantía estricta SemVer.

---

## 2. Matriz de Compatibilidad entre Versiones

- **Regla de validación en pipelines:** Un productor en `1.3.0` puede alimentar a un consumidor que declara soporte `^1.0.0` (mismo `MAJOR`, `producer.minor >= consumer.minMinor`). Si `MAJOR` difiere (`2.0.0` vs `1.x`), `@quimera/pipeline` rechaza la ejecución antes de iniciar con `ERR_PIPELINE_CONTRACT_MISMATCH`.
- **Ventana de soporte `N-1`:** Toda versión `MAJOR` nueva de un esquema o contrato debe incluir lector o adaptador de migración para la versión `MAJOR` inmediatamente anterior (`QR-NFR-012`).
- **Tolerancia en lectura (Postel acotado):** Los consumidores ignoran campos opcionales desconocidos en `MINOR` superiores únicamente cuando el esquema los marca aditivos, pero **nunca** ignoran errores de validación en campos requeridos ni en campos fiscales/monetarios.

---

## 3. Política de Deprecación

1. **Anuncio explícito:** Toda capacidad, flag CLI, pasaporte o contrato a retirar se marca `@deprecated` en código, manifiesto y changelog al menos **una versión `MINOR` completa** antes de su eliminación en el siguiente `MAJOR` (o mínimo 90 días en releases públicos v1+, salvo retiro forzado por una API estatal externa como ocurrió con el SOAP del BCCR en junio 2026).
2. **Advertencia en runtime:** Invocar un contrato o pasaporte deprecado emite `QuimeraWarning` (`W_DEPRECATED_CONTRACT`) en `--json` y `stderr`, indicando la alternativa vigente y la fecha/versión de retiro.
3. **Retiro externo de emergencia:** Si una institución externa apaga un endpoint (ej. BCCR SOAP legacy), el pasaporte pasa de inmediato a `status: "DEPRECATED_UPSTREAM"` y bloquea nuevas generaciones de código con un error explicativo señalando el pasaporte sustituto.

---

## 4. Capabilities Discovery y Pruebas de Contrato

- Todo paquete ejecutable exporta `getCapabilities(): ModuleCapabilities` y responde a `--capabilities --json` en su CLI, permitiendo a `@quimera/pipeline` y a agentes IA inspeccionar dinámicamente:
  - Versión del paquete y `contractVersion`.
  - Si requiere IA (`false` vs `'optional'`).
  - Soporte offline (`boolean`).
  - Pasos registrados con sus contratos de entrada/salida e idempotencia.
- **Puerta de contrato en CI (`QG-03`):** Todo PR que modifique archivos en `packages/core/src/contracts/*` o `packages/cr-api-passport/passports/*` ejecuta automáticamente una suite de pruebas de compatibilidad contra los JSON Schemas y fixtures de la rama `main`. Si detecta un cambio breaking sin bump SemVer + Changeset, el PR queda bloqueado.
