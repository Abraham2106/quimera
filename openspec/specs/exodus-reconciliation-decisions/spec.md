# exodus-reconciliation-decisions Specification

## Purpose

Define la detección conservadora de anomalías, el bloqueo obligatorio mediante decisiones humanas inmutables y la reanudación de lotes con verificación de integridad SHA-256.

## Requirements

### Requirement: La detección de anomalías sobre el dataset de referencia es exacta y conservadora

El motor de reconciliación SHALL identificar duplicados de clientes, facturas duplicadas, pagos mal atribuidos, identidades en conflicto y saldos irreconciliables sin fusionar automáticamente registros conflictivos; sobre `fixtures/demo-hvac-1000` debe coincidir exactamente con el manifiesto `40/12/7/3/1`.

#### Scenario: Conteos de anomalías del fixture HVAC coinciden con ANOMALIES.json

- **WHEN** se carga y reconcilia `fixtures/demo-hvac-1000`
- **THEN** el informe reporta 40 grupos de clientes duplicados, 12 facturas duplicadas, 7 pagos mal atribuidos, 3 pares de identidad en conflicto y 1 saldo irreconciliable

### Requirement: La migración verificada exige decisiones humanas aplicadas

La migración verificada SHALL bloquear la promoción de conflictos pendientes mientras no existan decisiones humanas explícitas aplicadas sobre ellos.

#### Scenario: Intento de migrar sin decisiones aprobadas

- **WHEN** se invoca `migrateVerified` con conflictos abiertos sin decisión aplicada
- **THEN** la migración falla con error estructurado y no promueve los registros en conflicto

### Requirement: Los lotes reanudables verifican la integridad SHA-256 del artefacto

La ejecución por lotes SHALL permitir pausar al 50% y reanudar produciendo el mismo resultado y digest final, y SHALL rechazar la reanudación con `ResumeArtifactHashError` si el artefacto origen fue alterado entre la pausa y la reanudación.

#### Scenario: Reanudación exitosa desde el 50%

- **WHEN** un lote se detiene al 50% y se reanuda contra el mismo artefacto sin modificar
- **THEN** el resultado final y su SHA-256 coinciden con una corrida continua

#### Scenario: Artefacto modificado antes de reanudar

- **WHEN** el contenido del artefacto cambia antes de reanudar el checkpoint
- **THEN** la reanudación falla con `ResumeArtifactHashError`
