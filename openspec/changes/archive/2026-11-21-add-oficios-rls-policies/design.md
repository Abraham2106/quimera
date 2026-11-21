# Diseño técnico: RLS en tablas ofi_*

## Migración SQL

1. Crear `apps/oficios/drizzle/0003_ofi_rls.sql` idempotente que, para cada tabla `ofi_*` con columna `tenant_id`:
   - Ejecute `ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;`
   - Ejecute `ALTER TABLE <tabla> FORCE ROW LEVEL SECURITY;`
   - Cree una política `tenant_isolation_<tabla>` usando `tenant_id = current_setting('app.current_tenant_id', true)::uuid`.
2. Mantener la ejecución bajo el rol no superusuario `quimera` (`NOSUPERUSER NOBYPASSRLS`) configurado en `scripts/ci-prepare-role.mjs` y `docker/`.

## Manejo de contexto por transacción

- En `apps/oficios/src/db/connection.ts`, encapsular consultas en un helper transaccional que ejecute `SELECT set_config('app.current_tenant_id', $1, true)` antes de cualquier operación sobre `ofi_*`.
- En `packages/data-exodus/src/demo/persist-oficios.ts`, garantizar que `set_config('app.current_tenant_id', tenantId, true)` esté activo dentro de la transacción que inserta en `ofi_customers` y `ofi_equipment`.

## Verificación

- Agregar prueba cross-tenant en `apps/oficios/tests/` ejecutada por `pnpm test:security` comprobando que el tenant A recibe cero filas de clientes, equipos y órdenes creados por el tenant B incluso si se omite el `WHERE tenant_id = ...`.
- Validar `pnpm verify` y `pnpm test:isolation` sin regresiones.
