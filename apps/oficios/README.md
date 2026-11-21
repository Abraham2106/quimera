# @quimera/oficios

Aplicación de referencia local-first para operación de talleres técnicos en Costa Rica (perfil inicial `hvac-refrigeration-v1`), construida sobre los módulos reutilizables de QUIMERA.

## Qué demuestra

- **Flujo operativo completo en español:** recepción → diagnóstico (con materiales y búsqueda CAByS vía `@quimera/cr-api-passport`) → presupuesto → **bloqueo HTTP `409`** si se intenta ejecutar sin aprobación del cliente → aprobación → en intervención → verificada → cierre con emisión de un único `FiscalIntent` vía `@quimera/fiscal-outbox`.
- **Onboarding sin dolor:** consume clientes y equipos migrados por `@quimera/data-exodus` mostrando su procedencia (archivo y fila original).
- **Stack:** servidor HTTP en Hono (`127.0.0.1:8787`), PostgreSQL 16 con migraciones SQL (`apps/oficios/drizzle/`), y UI React 19 + Vite + Tailwind en `apps/oficios/web/`.

## Arranque local

```bash
# 1. Levantar PostgreSQL y aplicar migraciones
docker compose up -d postgres
pnpm db:migrate

# 2. Iniciar la API HTTP en http://127.0.0.1:8787
DATABASE_URL=postgres://quimera:quimera@127.0.0.1:5432/quimera pnpm oficios:serve

# 3. En otra terminal, iniciar la interfaz web en http://127.0.0.1:5173
pnpm --filter @quimera/oficios dev:web
```

Variables opcionales: `OFICIOS_HOST` (default `127.0.0.1`) y `OFICIOS_PORT` (default `8787`).

## Límites conocidos del MVP

- **Autenticación:** en el MVP local la API lee cabeceras de prueba (`x-tenant-id`, `x-test-role`, `x-actor-id`). Debe reemplazarse por OIDC/JWT/MFA antes de cualquier despliegue fuera de loopback.
- **RLS en tablas `ofi_*`:** las tablas `qum_*` tienen `FORCE ROW LEVEL SECURITY`; las tablas `ofi_*` aplican `tenant_id NOT NULL` y filtrado de aplicación, quedando pendientes las políticas RLS propias para producción multi-tenant.
- **Notificaciones WhatsApp:** desactivadas por defecto salvo `QUIMERA_WHATSAPP_ENABLED=true`; nunca aprueban ni cierran órdenes.

## Pruebas

```bash
pnpm --filter @quimera/oficios typecheck
pnpm --filter @quimera/oficios typecheck:web
pnpm --filter @quimera/oficios test
```

Flujos detallados: [`docs/10-experience/oficios-user-flows.md`](../../docs/10-experience/oficios-user-flows.md).
