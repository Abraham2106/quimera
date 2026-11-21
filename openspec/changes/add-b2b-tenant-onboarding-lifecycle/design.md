# Diseño técnico: Onboarding B2B y ciclo de vida de organizaciones

## Modelo de datos

1. Extender metadatos de organización sobre `qum_tenants` (o tabla auxiliar `saas_organizations` con `tenant_id` único y `FORCE ROW LEVEL SECURITY`): nombre comercial, razón social, tipo y número de identificación CR validados con `normalizeCrIdentification`, actividad económica de 6 dígitos, perfil de oficio activo (`hvac-refrigeration-v1`), estado (`active`, `suspended`, `offboarding`) y zona horaria (`America/Costa_Rica`).
2. Crear tablas `saas_memberships` (`tenant_id`, `user_sub`, `role`, `status`, `created_at`) y `saas_invitations` (`id`, `tenant_id`, `email_hash`, `role`, `token_hash`, `expires_at`, `accepted_at`, `revoked_at`), ambas con `FORCE ROW LEVEL SECURITY`.
3. Almacenar únicamente el hash SHA-256 del token de invitación (nunca el token en texto plano).

## Reglas de negocio e invariantes

- **Provisioning atómico:** crear una organización registra el tenant, la membresía inicial `ADMIN` y el perfil base en una única transacción PostgreSQL.
- **Protección de último `ADMIN`:** toda degradación o remoción de rol `ADMIN` verifica dentro de transacción (`SELECT ... FOR UPDATE`) que quede al menos un `ADMIN` activo en la organización; si no, responde HTTP `409`.
- **Invitaciones:** expiran en 72 horas por defecto, son de un solo uso y vinculan al usuario autenticado al `tenant_id` exacto de la invitación.
- **Suspensión y exportación:** una organización suspendida bloquea mutaciones operativas con HTTP `403`, pero permite a un `ADMIN` exportar un paquete auditable de sus datos operativos y de procedencia sin borrar evidencia sujeta a retención fiscal de 5 años.
