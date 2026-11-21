# Onboarding de organizaciones B2B, usuarios e invitaciones multi-tenant

## Why

En el MVP local los tenants se inicializan mediante scripts o fixtures sintéticos (`taller-frio-demo`). Para operar como una aplicación B2B/SaaS real, cada PYME o taller debe poder darse de alta de forma autónoma o asistida, configurar su perfil fiscal costarricense, invitar a su equipo con roles diferenciados y gestionar bajas o suspensiones sin intervención manual en base de datos.

## What changes

Definir la capacidad `saas-tenant-onboarding` cubriendo el ciclo de vida completo de organizaciones B2B (`qum_tenants` + perfil operativo/fiscal), invitaciones por correo con tokens de un solo uso y expiración, administración de miembros y roles (`ADMIN`, `OPERATOR`, `AUDITOR_READONLY`), protección del último administrador y flujo de suspensión/exportación de datos.

## Impact

- App y paquetes afectados: `apps/oficios` (rutas `/api/v1/org/*`, `/api/v1/invitations/*`, UI de configuración), migraciones SQL de membresías e invitaciones, y `@quimera/core` (contratos de organización y roles).
- Depende de `add-oficios-rls-policies` y `replace-oficios-test-headers-auth`.
- Mantiene intacto el aislamiento de paquetes (`pnpm test:isolation`) y el flujo offline de `pnpm verify`.

## Fuera de alcance

- Cobro de suscripciones y límites de cuota (cubierto en `add-saas-billing-plans-and-quotas`).
- Gestión de certificados `.p12` y emisión real ante Hacienda (cubierto en `add-hacienda-production-fiscal-delivery`).
