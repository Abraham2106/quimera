# Diseño técnico: adaptadores productivos para staging verificable

## Almacén de artefactos por entorno

1. `apps/oficios` expone `createWorkbenchArtifactStore()` leyendo `OFICIOS_ARTIFACT_STORE`:
   - `memory` (default en `NODE_ENV=test` o `OFICIOS_AUTH_MODE=test-headers`): `InMemoryArtifactStore` de `@quimera/core`.
   - `fs`: `FsArtifactStore` con raíz `OFICIOS_ARTIFACT_DIR`.
   - `s3`: `S3ArtifactStore` con `S3HttpObjectLockClient` (PUT/GET/DELETE firmados AWS SigV4), endpoint `OFICIOS_S3_ENDPOINT`, bucket, región y claves de acceso; retención fiscal 1.825 días vía encabezado Object Lock; hook de cuarentena opcional antes de persistir.
2. Prueba loopback HTTP sin red externa que implemente las mismas llamadas que el cliente S3 y valida integridad SHA-256, bloqueo de borrado y cuarentena.

## Bóveda de secretos y certificados (pendiente de implementación)

- Ciphertext por tenant con AWS KMS o cifrado local AES-GCM en staging; subida `.p12` solo vía `ADMIN`; respuestas API nunca incluyen material de clave privada ni contraseñas.

## Worker fiscal, auth y web (pendiente de implementación)

- Worker: transporte `HaciendaSdkTransport` o loopback según `FISCAL_TRANSPORT`; drenaje de leases en `SIGTERM`.
- Auth: JWKS RS256/ES256 para JWT de usuario; webhooks de cobro con HMAC y ventana anti-replay de marca de tiempo.
- Web: servir `apps/oficios/web/dist` con cabeceras de seguridad estáticas.
- `db:migrate`: abortar si el rol de conexión tiene `SUPERUSER` o `BYPASSRLS`.

## Impacto en aislamiento

- Ningún paquete `@quimera/*` importa `apps/oficios`; la factoría vive solo en la app.
- `pnpm test:isolation` y `factura-ci` permanecen loopback-only.