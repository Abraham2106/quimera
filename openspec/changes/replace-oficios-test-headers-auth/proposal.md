# Reemplazar cabeceras de prueba de OficiOS por autenticación JWT/OIDC verificada

## Why

En el MVP local, `apps/oficios` confía en las cabeceras HTTP `x-tenant-id`, `x-test-role` y `x-actor-id`. Aunque esto es suficiente para la demo en `127.0.0.1`, impide exponer OficiOS fuera de loopback porque cualquier cliente podría suplantar tenant, rol o actor (`QR-SEC-008`).

## What changes

Introducir una capa de verificación de tokens firmados (JWT/OIDC con firma verificable contra JWKS o secreto de entorno explícito) para derivar `tenantId`, `role` y `actorId` en cada petición HTTP de `apps/oficios`, restringiendo el modo de cabeceras sintéticas exclusivamente a entornos de prueba explícitamente habilitados (`NODE_ENV=test` en loopback).

## Impact

- App afectada: `apps/oficios` (`src/api/middleware/`, `src/server.ts`, `web/src/api/client.ts`, `tests/`).
- No modifica dependencias de paquetes del núcleo (`pnpm test:isolation` sigue intacto).

## Fuera de alcance

- Gestión de UI de registro de usuarios o recuperación de contraseñas (delegado al proveedor OIDC).
- Políticas RLS en PostgreSQL (cubierto en `add-oficios-rls-policies`).
