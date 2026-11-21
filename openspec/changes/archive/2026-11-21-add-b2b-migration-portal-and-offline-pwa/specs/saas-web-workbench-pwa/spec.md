## ADDED Requirements

### Requirement: El portal web permite completar el flujo de Data Exodus con compuerta humana sin usar CLI

La consola B2B SHALL permitir a un `ADMIN` autorizado subir archivos fuente (rechazando XXE y zip-bombs), inspeccionar las columnas marcadas `NEEDS_REVIEW`, registrar decisiones inmutables sobre cada conflicto abierto y reanudar el pipeline hasta cargar clientes y equipos con procedencia.

#### Scenario: Resolución de conflictos desde la web desbloquea la carga verificada

- **WHEN** un `ADMIN` sube archivos con conflictos, aplica decisiones en la bandeja web y ejecuta `resume`
- **THEN** las decisiones quedan registradas con su identidad verificada, el pipeline pasa de pausa a completado y los registros cargados conservan procedencia

### Requirement: La PWA de técnicos en campo sincroniza operaciones offline con idempotencia y control de conflictos

La interfaz PWA de `OficiOS` SHALL almacenar en cola local notas de diagnóstico, materiales y adjuntos capturados sin conectividad, y SHALL sincronizarlos al reconectar usando `client_mutation_id` idempotente y detección optimista de concurrencia (`HTTP 409`) sin duplicar cierres ni `FiscalIntent`.

#### Scenario: Reenvío de una mutación offline tras reconexión no duplica materiales ni registros

- **WHEN** el navegador reenvía una operación de diagnóstico con el mismo `client_mutation_id` después de un corte de red intermedio
- **THEN** el servidor aplica la mutación exactamente una vez y devuelve el estado actualizado

#### Scenario: Conflicto concurrente al reconectar se señala explícitamente

- **WHEN** una orden fue modificada en el servidor mientras el técnico editaba una revisión anterior offline
- **THEN** la sincronización devuelve HTTP `409` sin sobrescribir silenciosamente el cambio remoto
