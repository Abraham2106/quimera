# saas-billing-entitlements Specification

## Purpose

Planes, webhooks de cobro con HMAC idempotente y cuotas que responden 402 sin interrumpir un comprobante fiscal ya encolado.

## Requirements

### Requirement: La ingestión de webhooks de cobro verifica firma HMAC y es idempotente

El receptor de eventos de suscripción SHALL validar la firma criptográfica del proveedor sobre el cuerpo crudo antes de procesar el evento, rechazar firmas inválidas con HTTP `401` y deduplicar eventos repetidos por identificador externo sin duplicar transiciones de estado.

#### Scenario: Webhook con firma HMAC inválida es rechazado

- **WHEN** llega una notificación de pago cuya firma no coincide con el secreto configurado
- **THEN** el servidor responde HTTP `401` y no altera la suscripción del tenant

#### Scenario: Reentrega del mismo webhook no altera el estado ya aplicado

- **WHEN** el proveedor entrega dos veces el mismo `external_event_id`
- **THEN** el segundo evento se reconoce de forma idempotente sin generar efectos secundarios duplicados

### Requirement: El control de cuotas bloquea nuevas operaciones excedidas sin romper flujos fiscales en curso

El sistema SHALL responder HTTP `402` con error estructurado cuando un tenant excede el límite de asientos, almacenamiento o módulos no incluidos en su plan, y SHALL NOT interrumpir la recuperación de `FiscalIntent` ya encolados ni la consulta de documentos históricos.

#### Scenario: Exceso de cuota de asientos bloquea nueva invitación

- **WHEN** un tenant alcanzó el `max_seats` de su plan e intenta invitar un nuevo miembro
- **THEN** la API rechaza la invitación con HTTP `402` y código `ERR_QUOTA_EXCEEDED`

#### Scenario: Suscripción suspendida no detiene la recuperación de un comprobante ya encolado

- **WHEN** una organización pasa a estado `suspended` mientras existe un `FiscalIntent` en vuelo hacia Hacienda
- **THEN** el worker fiscal completa el polling de estado hasta terminal y el `ADMIN` conserva acceso de lectura a sus comprobantes históricos
