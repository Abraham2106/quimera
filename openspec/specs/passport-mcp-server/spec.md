# passport-mcp-server Specification

## Purpose

Describe el servidor Model Context Protocol (`stdio`) expuesto por `@quimera/cr-api-passport` para consumo seguro por agentes de IA.

## Requirements

### Requirement: El servidor MCP expone exactamente las cuatro herramientas de solo lectura y verificación

El servidor MCP SHALL operar sobre transporte `stdio`, registrar las herramientas `passport_list`, `passport_inspect`, `passport_query` y `passport_verify`, y usar modo `fixture` por defecto cuando `QUIMERA_PASSPORT_MODE` no esté definido.

#### Scenario: Descubrimiento de herramientas registradas

- **WHEN** un cliente MCP lista las herramientas del servidor `quimera-cr-api-passport`
- **THEN** recibe `passport_list`, `passport_inspect`, `passport_query` y `passport_verify` sin herramientas de mutación o envío fiscal

### Requirement: Las respuestas MCP envuelven datos externos como contenido no confiable

Toda respuesta exitosa del servidor MCP SHALL envolver el payload retornado en `{ untrustedExternalData: true, data }` para separar explícitamente los datos externos de las instrucciones del agente.

#### Scenario: Consulta de pasaporte retorna envoltura untrustedExternalData

- **WHEN** un cliente invoca `passport_query` sobre `cr.hacienda.cabys` en modo `fixture`
- **THEN** el contenido textual JSON incluye `untrustedExternalData: true` junto al campo `data`
