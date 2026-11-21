## ADDED Requirements

### Requirement: Las tablas ofi_* aplican aislamiento multi-tenant mediante FORCE ROW LEVEL SECURITY

Todas las tablas del esquema `ofi_*` SHALL habilitar `ENABLE` y `FORCE ROW LEVEL SECURITY` en PostgreSQL 16 vinculadas a `app.current_tenant_id`, impidiendo que un rol de aplicación `NOSUPERUSER NOBYPASSRLS` lea o modifique clientes, equipos u órdenes de otro tenant incluso sin cláusula `WHERE`.

#### Scenario: Consulta sin filtro WHERE desde Tenant A no expone filas de Tenant B

- **GIVEN** existen clientes, equipos y órdenes persistidos para el tenant B en `ofi_*`
- **WHEN** una transacción con `app.current_tenant_id` fijado al tenant A consulta `ofi_customers` y `ofi_work_orders` sin filtro de aplicación
- **THEN** PostgreSQL devuelve cero filas pertenecientes al tenant B

#### Scenario: Transacción sin tenant configurado no expone filas

- **WHEN** se ejecuta una consulta sobre `ofi_*` sin fijar `app.current_tenant_id`
- **THEN** la consulta no devuelve registros de ningún tenant
