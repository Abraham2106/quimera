## Base de datos y contratos

- [x] Añadir contratos Zod de organización, membresía e invitación en `@quimera/core` o módulo de dominio de `apps/oficios`.
- [x] Crear migración SQL para perfil de organización, `saas_memberships` y `saas_invitations` con `ENABLE` y `FORCE ROW LEVEL SECURITY`.

## API y flujo de onboarding

- [x] Implementar aprovisionamiento transaccional de organización B2B y configuración de identidad fiscal base (validando cédula CR).
- [x] Implementar creación, aceptación y revocación de invitaciones con token hasheado y expiración.
- [x] Implementar gestión de miembros/roles con bloqueo HTTP `409` al intentar dejar una organización sin `ADMIN` activo.
- [x] Implementar estado `suspended` y exportación de datos del tenant respetando retención fiscal.

## UI y verificación

- [x] Añadir pantallas de onboarding inicial y gestión de equipo/roles en `apps/oficios/web/`.
- [x] Agregar pruebas de integración (provisioning atómico, invitación expirada/reusada, protección último admin, aislamiento cross-tenant) y ejecutar `pnpm spec:validate`.
- [x] Ejecutar `pnpm verify` completo en verde.