# Diseño técnico: Autenticación verificada en OficiOS

## Middleware de identidad

1. Agregar middleware de autenticación en `apps/oficios/src/api/` que valide `Authorization: Bearer <token>` verificando firma criptográfica, `iss`, `aud`, `exp` y claims obligatorios (`tenant_id`, `role`, `sub`).
2. Cuando `OFICIOS_AUTH_MODE` no esté explícitamente en `test-headers` (y nunca fuera de `127.0.0.1` o en `NODE_ENV=production`), rechazar cualquier intento de autenticar por `x-tenant-id`/`x-test-role`/`x-actor-id` con HTTP `401`.
3. Mantener el RBAC por rol (`recepcion`, `tecnico`, `admin`) leyendo únicamente el contexto verificado por el middleware.

## Frontera con pruebas locales

- Las pruebas unitarias/integración existentes podrán firmar JWTs efímeros locales con una clave de test para ejercitar el flujo real de verificación sin depender de un proveedor OIDC externo en `pnpm verify`.
- No se introducen dependencias de red externa ni credenciales reales en tests.
