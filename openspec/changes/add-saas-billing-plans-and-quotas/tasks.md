## Modelo de datos y puerto de billing

- [ ] Definir migración SQL para `saas_plans`, `saas_subscriptions`, `saas_billing_events` y `saas_usage_meters` con `FORCE ROW LEVEL SECURITY`.
- [ ] Definir puerto de verificación de webhooks y adaptador de pruebas determinista para CI offline.

## Webhooks y enforcement de cuotas

- [ ] Implementar receptor de webhooks con validación HMAC sobre raw body, deduplicación por `external_event_id` y transición de estados de suscripción.
- [ ] Implementar evaluador de entitlements y middleware HTTP `402` para límites de asientos, almacenamiento y módulos opcionales.
- [ ] Garantizar mediante prueba explícita que el worker de `@quimera/fiscal-outbox` completa entregas ya encoladas aun si la suscripción pasa a `suspended`.

## UI y verificación

- [ ] Exponer endpoint de consumo actual y límites del plan para mostrar estado en la UI de administración.
- [ ] Agregar pruebas de idempotencia de webhooks, firma inválida, exceso de cuota y frontera fiscal; correr `pnpm verify` y `pnpm spec:validate`.
