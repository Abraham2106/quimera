# clairic-optional-isolation Specification

## Purpose

Define los límites defensivos de `@quimera/adapter-clairic` como stub opcional de extracción asistida por IA y la invariante de aislamiento de paquetes verificada por `pnpm test:isolation`.

## Requirements

### Requirement: Ningún paquete del núcleo importa OficiOS ni el adaptador de IA

Cada paquete reutilizable bajo `packages/*` (`core`, `data-exodus`, `pipeline`, `cr-api-passport`, `fiscal-outbox`, `factura-ci`) SHALL poder empaquetarse de forma independiente mediante `pnpm deploy` sin incluir dependencias ni imports de `@quimera/oficios` ni de `@quimera/adapter-clairic`, y el baseline SHALL operar completamente con `QUIMERA_AI_ENABLED=false`.

#### Scenario: Verificación de aislamiento con pnpm deploy

- **WHEN** se ejecuta `pnpm test:isolation`
- **THEN** cada paquete del núcleo despliega limpio sin arrastrar `@quimera/oficios` ni `@quimera/adapter-clairic`

### Requirement: El adaptador aplica límites estrictos de payload, umbral de confianza y contención de prompt injection

`@quimera/adapter-clairic` SHALL rechazar con `ERR_CLAIRIC_PAYLOAD_LIMIT` más de 4 imágenes, archivos mayores a 4 MiB, payloads totales mayores a 8 MiB o URLs remotas; SHALL marcar `AI_LOW_CONFIDENCE` cuando la confianza sea menor a `0.90`; y SHALL tratar cualquier instrucción inyectada en el texto de entrada como datos inertes sin autorizar aprobaciones.

#### Scenario: Payload con URL remota o tamaño excedido es rechazado

- **WHEN** se valida un payload con más de 4 imágenes, un archivo superior a 4 MiB o una URL remota
- **THEN** la validación falla con `ERR_CLAIRIC_PAYLOAD_LIMIT`

#### Scenario: Prompt injection queda contenido como dato

- **WHEN** el texto de entrada contiene instrucciones adversarias para aprobar una operación
- **THEN** el adaptador preserva el texto solo como dato extraído y no aprueba ni muta estado alguno
