# passport-registry-client Specification

## Purpose

Define el catálogo declarativo de APIs públicas de Costa Rica, el cliente HTTP con guardrails operativos y el detector de deriva de contratos de `@quimera/cr-api-passport`.

## Requirements

### Requirement: El registro carga únicamente manifiestos válidos y nunca inventa endpoints privados

El registro SHALL validar cada manifiesto YAML contra `ApiPassportSchema`, incluir pasaportes verificados para Hacienda (`taxpayer`, `cabys`, `fx`), BCCR SDDE y SNIT, y SHALL rechazar la invención de endpoints no documentados para contratos privados como Correos de Costa Rica.

#### Scenario: Inspección del catálogo completo en modo fixture

- **WHEN** se listan y verifican los pasaportes con `--all --mode fixture`
- **THEN** cada pasaporte válido supera la validación de esquema sin realizar llamadas a Internet

### Requirement: El cliente aplica validación de entrada, caché TTL, límite de cuota y circuit breaker

`PassportClient` SHALL validar parámetros localmente antes de emitir tráfico, aplicar caché TTL configurable y limitar la tasa por host mediante *token bucket* y *circuit breaker* para prevenir bloqueos de IP ante respuestas `429`.

#### Scenario: Entrada inválida rechazada antes de tocar la red

- **WHEN** se consulta `cr.hacienda.cabys` con una cadena de búsqueda menor a 3 caracteres
- **THEN** el cliente devuelve un error de entrada inválida sin efectuar llamada remota

#### Scenario: Respuesta 429 activa protección contra saturación

- **WHEN** un endpoint devuelve HTTP `429 Too Many Requests`
- **THEN** el cliente clasifica el error como reintentable (`ERR_PASS_RATE_LIMITED`) y activa el *circuit breaker* del host

### Requirement: El verificador detecta deriva de contrato respecto al esquema declarado

`verifyPassport` SHALL comparar la respuesta observada (en fixture o live) contra el esquema JSON declarado y reportar `DRIFT_DETECTED` cuando falte un campo requerido o cambie su tipo.

#### Scenario: Fixture con campo faltante dispara deriva de contrato

- **WHEN** se verifica `cr.hacienda.cabys` contra un fixture al que le falta un campo obligatorio
- **THEN** el reporte marca `DRIFT_DETECTED` identificando el problema de esquema
