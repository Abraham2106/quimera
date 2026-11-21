# oficios-workshop-flow Specification

## Purpose

Describe el flujo operativo local-first de la aplicación de referencia `@quimera/oficios` (`hvac-refrigeration-v1`): API HTTP en `127.0.0.1:8787`, máquina de estados de órdenes de trabajo, bloqueo sin aprobación y cierre con `FiscalIntent`.

## Requirements

### Requirement: La máquina de estados exige aprobación del cliente antes de intervenir la orden

`OficiOS` SHALL aplicar la transición `recepción → diagnóstico → presupuesto → aprobación → en intervención → verificada → cerrada` y SHALL responder HTTP `409` cuando se intente iniciar intervención sobre una orden sin aprobación registrada del cliente.

#### Scenario: Intento de intervención sin aprobación devuelve HTTP 409

- **WHEN** se solicita transicionar una orden presupuestada hacia intervención sin aprobación previa
- **THEN** la API rechaza la transición con estado HTTP `409` y conserva el estado actual de la orden

### Requirement: El cierre de una orden aprobada emite exactamente un FiscalIntent

Al cerrar una orden de trabajo verificada, `OficiOS` SHALL encolar exactamente un `FiscalIntent` idempotente en PostgreSQL y SHALL no crear duplicados si la operación de cierre se repite.

#### Scenario: Cierre repetido mantiene un único FiscalIntent

- **WHEN** una orden pasa el flujo completo hasta `cerrada` y se reintenta la acción de cierre
- **THEN** existe exactamente un `FiscalIntent` asociado a la orden

### Requirement: El diagnóstico soporta materiales con búsqueda CAByS y conserva procedencia de clientes

`OficiOS` SHALL servir clientes y equipos cargados desde PostgreSQL mostrando su procedencia de archivo y fila origen, y SHALL resolver consultas de catálogo CAByS mediante `@quimera/cr-api-passport` en modo fixture sin requerir Internet.

#### Scenario: Consulta de cliente migrado expone su origen

- **WHEN** la interfaz web o la API consulta clientes migrados desde `demo-hvac-1000`
- **THEN** cada registro incluye la referencia al archivo y fila de procedencia original
