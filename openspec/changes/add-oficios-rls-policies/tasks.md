## Migración y base de datos

- [x] Crear migración `apps/oficios/drizzle/0003_ofi_rls.sql` con `ENABLE` y `FORCE ROW LEVEL SECURITY` para todas las tablas `ofi_*`.
- [x] Actualizar `scripts/db-migrate.mjs` para aplicar la nueva migración en orden.

## Aplicación y cargador de datos

- [x] Establecer `app.current_tenant_id` con alcance transaccional (`set_config(..., true)`) en `apps/oficios/src/db/` para todas las rutas de la API.
- [x] Verificar que `packages/data-exodus/src/demo/persist-oficios.ts` configure `app.current_tenant_id` dentro de su transacción de escritura.

## Pruebas y verificación

- [x] Añadir prueba de regresión cross-tenant en `apps/oficios/tests/` y registrarla en el script `pnpm test:security`.
- [x] Ejecutar `pnpm verify` y `pnpm spec:validate` en verde.
