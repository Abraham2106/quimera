# Agregar políticas RLS a las tablas ofi_* de OficiOS

## Why

Actualmente las tablas `qum_*` de procedencia y migración aplican `ENABLE` y `FORCE ROW LEVEL SECURITY` verificadas en CI con un rol `NOSUPERUSER NOBYPASSRLS`, pero las tablas `ofi_*` del taller (`ofi_customers`, `ofi_equipment`, `ofi_work_orders`, etc.) solo dependen de filtros de aplicación sobre `tenant_id`. Antes de operar OficiOS en un entorno multi-tenant real, el aislamiento debe hacerse cumplir también en PostgreSQL.

## What changes

Agregar una migración SQL en `apps/oficios/drizzle/` que habilite y fuerce políticas `ROW LEVEL SECURITY` por `tenant_id` en todas las tablas `ofi_*`, asegurar que las conexiones de la API y del cargador de migración establezcan `app.current_tenant_id` dentro de cada transacción y añadir pruebas de aislamiento cross-tenant en `pnpm test:security`.

## Impact

- Paquetes y apps afectados: `apps/oficios` (`drizzle/`, `src/db/`, `src/api/`, `tests/`) y `packages/data-exodus/src/demo/persist-oficios.ts`.
- Mantiene intacto el aislamiento de paquetes (`pnpm test:isolation`) y el flujo offline (`pnpm verify`).

## Fuera de alcance

- Reemplazo de autenticación HTTP por OIDC/JWT (cubierto en `replace-oficios-test-headers-auth`).
- Políticas de retención o backup/PITR en producción.
