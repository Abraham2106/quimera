# ADR-006: Modelo de Conflictos y Reconciliación Asistida con Decisiones Inmutables

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-DATA-007`, `QR-DATA-009`, `QR-DATA-010`, `QR-DATA-013`

## Contexto
Las fuentes PYME contienen duplicados exactos, duplicados probables («Distribuidora Rodríguez» vs «Distribuidora Rodríguez S.A.»), cédulas contradictorias, pagos mal atribuidos y saldos imposibles de cuadrar.

## Problema
Establecer qué puede automatizarse de forma segura, qué debe bloquearse para decisión humana y cómo permitir correcciones posteriores sin borrar evidencia histórica.

## Alternativas evaluadas
1. **Clasificación explícita de severidad (`INFO`, `WARNING`, `BLOCKING`) + tabla inmutable `resolution_decisions` con cadena `SUPERSEDES` + soporte para estado `QUARANTINED`.**
2. **Auto-fusión por puntaje de similitud (o LLM) con edición directa de tablas.**
3. **Bloquear toda la migración ante cualquier discrepancia menor sin opción de cuarentena.**

## Criterios de decisión
Cero corrupción silenciosa de entidades/saldos, auditabilidad contable, capacidad práctica de avanzar cuando un único registro histórico es genuinamente irreconciliable.

## Evidencia relevante
- El escenario de referencia incluye «1 saldo imposible de reconciliar»: sin un estado explícito de cuarentena (`QUARANTINE_UNRECONCILABLE`), un solo dato histórico corrupto bloquearía indefinidamente la salida a producción de los otros 999 registros válidos.
- Sobrescribir decisiones destruye el rastro de auditoría.

## Decisión
Adoptar un modelo de **conflictos tipados** con dos reglas estrictas:
1. Solo los **duplicados exactos** (clave de 50 dígitos idéntica o misma cédula + mismo nombre normalizado sin contradicción de atributos clave) pueden resolverse automáticamente (`AUTO_MERGE`).
2. Todo duplicado probable, contradicción de identidad, monto incompatible o pago huérfano crea un `Conflict` en estado `OPEN` que exige una **`ResolutionDecision` inmutable** (`MERGE`, `KEEP_SEPARATE`, `SELECT_VALUE`, `QUARANTINE_UNRECONCILABLE`). Si una decisión debe corregirse posteriormente, se inserta una nueva fila con `supersedes_decision_id`.

## Consecuencias
- **Positivas:** Historial 100% auditable, migración reproducible mediante archivos `decisions.yaml`, aislamiento limpio de registros irreconciliables en `quarantined_exceptions`.
- **Negativas:** Exige intervención humana antes del corte cuando existen ambigüedades reales (característica intencional, no defecto).

## Riesgos
- **Riesgo:** Fatiga de revisión si las reglas generan demasiados falsos positivos de duplicados probables.
- **Mitigación:** Calibración conservadora de umbrales (cédula exacta tiene prioridad sobre nombre, normalización de tildes y sufijos societarios) y resolución por lotes mediante `decisions.yaml`.

## Condiciones de revisión
Si se incorporan clientes con >50.000 entidades y cientos de conflictos, agregar agrupación por clúster de similitud y UI de revisión masiva con filtros por confianza.
