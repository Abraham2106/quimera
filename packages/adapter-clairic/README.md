# @quimera/adapter-clairic

Adaptador opcional y estrictamente aislado para extracción asistida por IA (en el MVP funciona como un **stub determinista**, sin llamadas a GPU ni a Workers AI).

## Principios de aislamiento

- **Deshabilitado en el baseline:** el sistema completo funciona con `QUIMERA_AI_ENABLED=false`. El adaptador solo extrae cuando `QUIMERA_AI_ENABLED=true`; de lo contrario `extract()` devuelve `ERR_CLAIRIC_AI_DISABLED` (error tipado, sin tráfico ni inferencia).
- **Cero dependencias entrantes:** ningún paquete del núcleo (`@quimera/core`, `@quimera/data-exodus`, `@quimera/pipeline`, `@quimera/cr-api-passport`, `@quimera/fiscal-outbox`, `@quimera/factura-ci`) ni `@quimera/oficios` importa este paquete (verificado en cada corrida por `pnpm test:isolation`).
- **Límites defensivos de payload:** rechaza más de `MAX_CLAIRIC_IMAGES` (4) imágenes, archivos mayores a `MAX_CLAIRIC_FILE_BYTES` (4 MiB), payloads totales sobre `MAX_CLAIRIC_TOTAL_BYTES` (8 MiB) y URLs remotas (`ERR_CLAIRIC_PAYLOAD_LIMIT`).
- **Compuerta de baja confianza y contención de prompt injection:** extracciones con confianza inferior a `0.90` abren `AI_LOW_CONFIDENCE` (calculado con `lowConfidenceConflict`), expuesto en `data.conflictCodes` y en la advertencia `W_AI_LOW_CONFIDENCE`; el texto inyectado se conserva como dato inerte y nunca autoriza acciones ni aprobaciones.
- **Nombres de campo literales:** los metacaracteres regex en los nombres del esquema se escapan antes de construir los patrones de extracción.

## Exports principales

| Export | Tipo | Descripción |
| --- | --- | --- |
| `ClairicStubAdapter`, `createClairicStubAdapter` | Clase / Factory | Stub determinista del adaptador de extracción |
| `validateClairicPayload`, `containsRemoteUrl`, `scanBytesForRemoteUrl` | Funciones | Validación de límites de tamaño y bloqueo de URLs remotas |
| `lowConfidenceConflict`, `isFiscalFieldName`, `defaultStubConfidence` | Funciones | Evaluación de umbrales de confianza y generación de conflictos |
| `ERR_CLAIRIC_AI_DISABLED`, `W_AI_LOW_CONFIDENCE` | Constantes | Códigos de error de adaptador deshabilitado y advertencia de baja confianza |
| `stubExtractFromSchema` | Función | Extracción determinista basada en esquema para pruebas |

## Pruebas

```bash
pnpm --filter @quimera/adapter-clairic test
```
