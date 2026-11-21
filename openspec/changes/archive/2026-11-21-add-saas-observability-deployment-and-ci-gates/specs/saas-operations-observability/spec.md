## ADDED Requirements

### Requirement: Los servicios de producción exponen sondas de salud y ejecutan apagado ordenado

`oficios-api` SHALL exponer `GET /healthz` y `GET /readyz` (verificando conectividad con PostgreSQL), y tanto la API como `fiscal-outbox-worker` SHALL responder a `SIGTERM` dejando de aceptar trabajo nuevo y drenando operaciones en curso antes de cerrar conexiones.

#### Scenario: Base de datos inaccesible marca readiness como no disponible

- **WHEN** PostgreSQL no responde y se consulta `GET /readyz`
- **THEN** el servicio responde HTTP `503` con estado estructurado sin exponer credenciales de `DATABASE_URL`

#### Scenario: Apagado con SIGTERM no deja leases fiscales huérfanos en ejecución

- **WHEN** `fiscal-outbox-worker` recibe `SIGTERM` mientras procesa un documento
- **THEN** deja de reclamar nuevos documentos, finaliza o libera limpiamente el lease activo y termina con código `0`

### Requirement: Cada organización B2B dispone de una bitácora de auditoría append-only aislada por tenant

El sistema SHALL registrar en una bitácora append-only con `FORCE ROW LEVEL SECURITY` toda acción administrativa o financiera crítica (cambios de rol, configuración fiscal, decisiones de migración, aprobaciones y cierres), consultable únicamente por `ADMIN` y `AUDITOR_READONLY` del mismo tenant y redactada contra fugas de secretos.

#### Scenario: AUDITOR_READONLY consulta eventos de su tenant sin ver otros tenants ni secretos

- **WHEN** un `AUDITOR_READONLY` del tenant A consulta la bitácora de auditoría
- **THEN** recibe únicamente eventos del tenant A con actor, marca de tiempo y recurso afectado, sin secretos ni registros del tenant B

### Requirement: CI ejecuta verificación end-to-end offline y controles de supply chain en cada PR

El flujo de integración continua SHALL ejecutar `pnpm spec:validate`, `pnpm verify` (incluyendo `demo:verify` con `QUIMERA_AI_ENABLED=false`), escaneo automatizado de secretos (`gitleaks`) y auditoría de vulnerabilidades de nivel alto (`pnpm audit --audit-level=high`).

#### Scenario: Secreto accidental en un commit es bloqueado antes de merge

- **WHEN** un commit introduce un token o clave privada coincidente con las reglas de detección de secretos
- **THEN** el job de CI falla bloqueando la integración
