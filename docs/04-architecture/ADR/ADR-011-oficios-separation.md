# ADR-011: Separación Arquitectónica de OficiOS como Consumidor

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-CORE-002`, `QR-CORE-003`, `QR-OFI-001`..`007`

## Contexto
OficiOS es tanto la demostración empresarial concreta de QUIMERA (en el oficio inicial de refrigeración y aire acondicionado) como un producto comercial potencial para talleres y técnicos independientes en Costa Rica.

## Problema
Prevenir que la presión de la demo de hackathon o las necesidades específicas de talleres acoplen `QUIMERA Core` o `Data Exodus` a entidades exclusivas de OficiOS (`work_orders`, `hvac_equipment`), degradando la reutilización del toolkit por otros desarrolladores.

## Alternativas evaluadas
1. **Ubicar OficiOS en `apps/oficios` como consumidor puro**, con su esquema destino (`oficios-v1`) registrado como un *target schema* más de `Data Exodus` y con reglas de linting/CI prohibiendo imports desde `packages/*` hacia `apps/*`.
2. **Integrar las entidades de OficiOS dentro de `@quimera/core`** para simplificar tipos en el hackathon.

## Criterios de decisión
Reutilización del toolkit para cualquier dominio empresarial (ferreterías, distribuidoras, clínicas, talleres), claridad de separación Builders vs Business y facilidad de escindir OficiOS en el futuro.

## Evidencia relevante
- El mercado local ya tiene competidores como TallerApp y Astra; si OficiOS fracasa comercialmente o pivota de vertical, el valor de `Data Exodus`, `CR API Passport` y `Factura CI` debe permanecer intacto.
- Tratar `oficios-v1` como un `TargetSchema` declarativo valida que `Data Exodus` realmente es genérico y configurable.

## Decisión
Separar estrictamente **`apps/oficios`** como consumidor externo del toolkit:
- Ningún paquete en `packages/*` puede importar ni referenciar `apps/oficios`.
- El contrato de oficio `hvac-refrigeration-v1` y la máquina de estados de `WorkOrder` viven exclusivamente en `apps/oficios`.
- `Data Exodus` carga en las tablas de OficiOS mediante una definición de esquema destino declarativa (`targetSchema: "oficios-v1"`), intercambiable por cualquier otro esquema destino.

## Consecuencias
- **Positivas:** El toolkit mantiene su carácter generalista tipo Apache; OficiOS sirve como cliente real #1 que valida la DX del toolkit.
- **Negativas:** Pequeño esfuerzo adicional para definir `targetSchema` declarativamente en lugar de hardcodear `INSERT INTO work_orders` dentro de Data Exodus.

## Riesgos
- **Riesgo:** Fuga de supuestos de talleres dentro de reglas de reconciliación de Data Exodus.
- **Mitigación:** Todas las reglas de Data Exodus operan sobre primitivas universales (`entityType`, `taxId`, `monetaryAmount`, `documentRef`), nunca sobre conceptos de aire acondicionado.

## Condiciones de revisión
Extraer `apps/oficios` a un repositorio independiente cuando inicie pilotos pagos comerciales con equipo o ciclo de release separado.
