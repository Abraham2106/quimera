## Autenticación y RBAC

- [x] Implementar verificador JWT/OIDC en `apps/oficios/src/api/` que derive `tenantId`, `role` y `actorId` desde claims firmados.
- [x] Bloquear el modo de cabeceras de prueba fuera de `NODE_ENV=test` / loopback y responder HTTP `401` ante tokens ausentes, expirados o con firma inválida.
- [x] Actualizar la UI web (`apps/oficios/web/src/api/client.ts`) para enviar `Authorization: Bearer` y manejar sesiones expiradas (`401`).

## Pruebas y verificación

- [x] Agregar pruebas de rechazo `401`/`403` (sin token, firma alterada, token expirado, rol insuficiente, intento de suplantación por `x-tenant-id`).
- [x] Ejecutar `pnpm verify`, `pnpm test:security` y `pnpm spec:validate` en verde.
