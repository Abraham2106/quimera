# Diseño técnico: Planes, suscripciones y cuotas SaaS

## Esquema y máquina de estados

1. `saas_plans`: catálogo versionado de planes (`starter`, `pro`, `agency`) con límites declarativos (`max_seats`, `monthly_fiscal_intents`, `max_storage_bytes`, `features_json` para módulos opcionales como `whatsapp` o `clairic`).
2. `saas_subscriptions` (con `FORCE ROW LEVEL SECURITY` por `tenant_id`): estado (`trialing`, `active`, `past_due`, `suspended`, `canceled`), `current_period_start`, `current_period_end`, `grace_until` y referencia externa de suscripción.
3. `saas_billing_events`: tabla append-only indexada por `(provider, external_event_id)` para garantizar procesamiento idempotente y resistente a reintentos o reordenamiento de webhooks.
4. `saas_usage_meters`: contadores mensuales por `(tenant_id, period_ym, metric_key)` actualizados transaccionalmente al crear miembros, almacenar artefactos o encolar intenciones fiscales.

## Reglas de enforcement y frontera fiscal

- Verificar firma HMAC del webhook sobre el cuerpo crudo antes de parsear JSON; rechazar firmas inválidas con HTTP `401`.
- Durante `past_due` dentro de `grace_until`, emitir cabecera o aviso de mora sin interrumpir la operación diaria.
- Al exceder cuotas o vencer el período de gracia (`suspended`/`canceled`), bloquear únicamente **nuevas** operaciones facturables o creación de nuevos usuarios/órdenes con HTTP `402 Payment Required` y código estructurado (`ERR_QUOTA_EXCEEDED` o `ERR_SUBSCRIPTION_INACTIVE`).
- **Invariante crítica:** el enforcement de billing **nunca** detiene el polling/recuperación de un `FiscalIntent` ya encolado ni impide descargar XML/procedencia histórica.
