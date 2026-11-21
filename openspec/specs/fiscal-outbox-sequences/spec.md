# fiscal-outbox-sequences Specification

## Purpose

Define el contrato del outbox fiscal transaccional en PostgreSQL (`fob_*`): asignación atómica de consecutivos, idempotencia de `FiscalIntent` y recuperación de entregas mediante *leases*.

## Requirements

### Requirement: La asignación de consecutivos es atómica por emisor, sucursal, terminal y ambiente

`allocateConsecutive` SHALL asignar números consecutivos estrictamente crecientes y sin duplicados en PostgreSQL incluso bajo solicitudes concurrentes sobre la misma serie.

#### Scenario: Solicitudes concurrentes sobre la misma serie reciben consecutivos distintos

- **WHEN** múltiples llamadas concurrentes solicitan el siguiente consecutivo para el mismo emisor, sucursal, terminal y tipo de documento
- **THEN** cada llamada obtiene un consecutivo único sin colisiones ni huecos duplicados

### Requirement: La encolación de intenciones fiscales es idempotente por clave de negocio

`enqueueIntent` SHALL garantizar que repetir la misma clave de idempotencia comercial retorne el mismo `FiscalIntent` existente sin crear documentos duplicados.

#### Scenario: Reintento de cierre genera un único FiscalIntent

- **WHEN** se invoca `enqueueIntent` dos veces con la misma clave de idempotencia y tenant
- **THEN** existe exactamente un registro de intención fiscal en PostgreSQL

### Requirement: El worker procesa con leases y consulta estados ambiguos antes de reenviar

El worker de entrega SHALL reclamar documentos mediante *leases* temporales (`claimNextDocument`), liberar o expirar *leases* tras fallos y consultar el estado del comprobante ya despachado (`isPostDispatched`) antes de reintentar un envío tras corte de red.

#### Scenario: Corte de red posterior al despacho no duplica el envío

- **WHEN** el transporte falla después de que el documento fue despachado y el worker vuelve a procesar el pendiente
- **THEN** el worker consulta el estado del comprobante despachado en lugar de generar una segunda emisión

### Requirement: Las tablas fob_* aplican FORCE ROW LEVEL SECURITY por tenant

Todas las tablas del esquema `fob_*` SHALL habilitar `ENABLE` y `FORCE ROW LEVEL SECURITY` vinculadas a `app.current_tenant_id`, garantizando que ningún tenant ni worker con contexto de otro emisor pueda leer consecutivos, intenciones fiscales o respuestas de otro cliente B2B.

#### Scenario: Consulta sobre fob_* desde Tenant A no accede a documentos de Tenant B

- **WHEN** existen intenciones fiscales y secuencias del tenant B y se consulta bajo el contexto de sesión del tenant A
- **THEN** PostgreSQL devuelve cero filas del tenant B
