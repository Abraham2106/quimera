# Planes SaaS, suscripciones, cuotas y entitlements por tenant

## Why

Para monetizar QUIMERA/OficiOS como un producto SaaS B2B sostenible (por ejemplo planes por taller o licencias por agencia implementadora) se requiere un control determinista de suscripciones, cuotas de uso (técnicos activos, documentos fiscales mensuales, almacenamiento CAS) y habilitación de módulos opcionales (`adapter-clairic`, notificaciones WhatsApp), sin comprometer nunca la disponibilidad de comprobantes fiscales ya emitidos.

## What changes

Definir la capacidad `saas-billing-entitlements` que gestiona catálogo de planes, ingestión idempotente de webhooks de pasarela de pagos con verificación HMAC, máquina de estados de suscripción (`trialing`, `active`, `past_due`, `suspended`, `canceled`), medición de consumo y reglas claras de enforcement (`HTTP 402`) que protegen la integridad fiscal.

## Impact

- App y paquetes afectados: `apps/oficios` (módulo de billing/entitlements, middleware de cuotas, endpoint de webhooks) y migraciones SQL (`saas_subscriptions`, `saas_usage_meters`, `saas_billing_events`).
- Depende de `add-b2b-tenant-onboarding-lifecycle`.
- No introduce dependencias de pasarela de pago en los paquetes núcleo `@quimera/*` (`pnpm test:isolation` sin cambios).

## Fuera de alcance

- Facturación propia del SaaS hacia sus clientes en moneda local/USD vía un procesador específico (el contrato se define sobre un puerto de pasarela agnóstico).
- Precios definitivos de mercado (dependen de validación comercial según `docs/12-product-strategy/validation-plan.md`).
