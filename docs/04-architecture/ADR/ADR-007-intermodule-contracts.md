# ADR-007: Contratos Tipados entre Módulos (`@quimera/core` + Zod v4 + JSON Schema)

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-CORE-001`, `QR-CORE-005`, `QR-CORE-007`, `QR-NFR-005`

## Contexto
Los módulos de QUIMERA intercambian datos en TypeScript (en-proceso), por CLI (`--json`), por HTTP (OficiOS/Factura CI), por manifiestos YAML (Pipeline/Passport) y por MCP (agentes IA), además de contemplar futuros adaptadores en otros lenguajes (ej. Python).

## Problema
Evitar que los tipos TypeScript, la validación en runtime y los esquemas JSON Schema diverjan entre sí.

## Alternativas evaluadas
1. **Zod v4 como fuente única de verdad en `@quimera/core`**, exportando tipos TS inferidos (`z.infer`) y **JSON Schema Draft 2020-12** generado automáticamente (`z.toJSONSchema()`).
2. **Escribir JSON Schema / OpenAPI manualmente** y generar código TS con `json-schema-to-typescript`.
3. **Protobuf / gRPC** para contratos internos.

## Criterios de decisión
Sinergia con `@dojocoding/hacienda-sdk`, cero duplicación entre esquema y runtime, ergonomía DX y soporte nativo para JSON Schema y MCP.

## Evidencia relevante
- `@dojocoding/hacienda-sdk@0.13.0` ya estandarizó en `zod@^4.6.5`.
- Zod v4 incluye generación nativa a JSON Schema Draft 2020-12 sin librerías externas desactualizadas.
- Protobuf introduce compilación binaria (`protoc`) innecesaria para un monolito modular Node.js con CLI JSON y MCP.

## Decisión
Definir todos los contratos públicos en `@quimera/core` con **Zod v4**, generando automáticamente sus artefactos **JSON Schema Draft 2020-12** en build/CI y verificando en cada PR que los esquemas exportados no introduzcan cambios incompatibles sin incremento de versión SemVer.

## Consecuencias
- **Positivas:** Fuente única de verdad, validación estricta en fronteras runtime, compatibilidad directa con MCP y cualquier consumidor externo no-TS.
- **Negativas:** Dependencia del ecosistema Zod v4 en `@quimera/core` (acotada a una sola librería estable y ligera).

## Riesgos
- **Riesgo:** Cambios accidentales de esquema que rompan consumidores externos.
- **Mitigación:** Snapshot tests de JSON Schema y pruebas de compatibilidad N-1 en CI (`QR-NFR-012`).

## Condiciones de revisión
Si en el futuro se requieren clientes binarios de altísimo throughput entre servicios en distintos lenguajes, evaluar Protobuf solo para esos canales específicos.
