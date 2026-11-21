# Especificaciones de Interfaz (API HTTP de OficiOS y Contratos UI) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [Flujos de Usuario OficiOS](./oficios-user-flows.md) | [Contratos Públicos](../06-interfaces/public-contracts.md) | [Seguridad QR-SEC-008](../07-security/security-requirements.md)

---

## 1. Arquitectura de Interfaz de `apps/oficios`

`apps/oficios` expone:
1. **API REST JSON (Hono sobre Node.js 22+)** bajo `/api/v1/*`, con validación Zod en cada request/response y formato de error uniforme `QuimeraError`.
2. **Interfaz Web Ligera (SPA React / Vite o SSR liviano con HTML semántico responsive)** diseñada mobile-first para técnicos en campo y escritorio para recepción/administración.

> **Nota MVP:** La interfaz web es deliberadamente minimalista y enfocada en demostrar los 9 flujos esenciales de `oficios-user-flows.md`. No introduce frameworks pesados ni funcionalidades ajenas a la demo.

---

## 2. Convenciones de API HTTP (`/api/v1`)

- **Autenticación y Tenant:** Cabecera `Authorization: Bearer <token>` que resuelve `{ userId, tenantId, role }` (`ADMIN`, `OPERATOR`, `AUDITOR_READONLY`). Nunca se confía en un `tenantId` enviado libremente por el cliente en el body.
- **Concurrencia optimista:** `WorkOrder` incluye campo entero `version`; toda mutación envía `expectedVersion` y retorna `409 Conflict` (`ERR_CONCURRENT_MODIFICATION`) si cambió.
- **Idempotencia en cierre/facturación:** `POST /api/v1/work-orders/:id/close` acepta cabecera `Idempotency-Key` y vincula `operationId = workOrder.id` en `Fiscal Outbox`.
- **Formato monetario en JSON:** `{ "amountMinor": 8500000, "currency": "CRC", "display": "₡85.000,00" }` (siempre entero en unidades menores, sin floats).

---

## 3. Catálogo de Endpoints REST (`apps/oficios`)

| Método y Ruta | Roles permitidos | Propósito | Códigos de respuesta |
|---|---|---|---|
| `GET /api/v1/health` | Público | Salud de API y conectividad PostgreSQL | `200`, `503` |
| `GET /api/v1/customers` | Todos | Listar/buscar clientes del tenant (incluye indicador `migrated`) | `200` |
| `POST /api/v1/customers` | `ADMIN`, `OPERATOR` | Crear cliente nuevo | `201`, `400`, `403` |
| `GET /api/v1/customers/:id/provenance` | Todos | Devolver cadena completa de procedencia (`qum_provenance_entries` + `qum_decisions` + `qum_artifacts`) | `200`, `404` |
| `GET /api/v1/customers/:id/equipment` | Todos | Listar equipos HVAC del cliente | `200` |
| `POST /api/v1/equipment` | `ADMIN`, `OPERATOR` | Registrar equipo bajo contrato `hvac-refrigeration-v1` | `201`, `400`, `403` |
| `GET /api/v1/catalog/cabys?q=<texto>` | Todos | Proxy interno hacia `@quimera/cr-api-passport` (`cr.hacienda.cabys`) con caché y advertencia si modo offline | `200`, `400`, `503` |
| `POST /api/v1/work-orders` | `ADMIN`, `OPERATOR` | Crear orden de servicio (`RECEIVED`) | `201`, `400`, `403` |
| `GET /api/v1/work-orders/:id` | Todos | Detalle completo de orden, eventos, materiales, aprobaciones, adjuntos y estado fiscal | `200`, `404` |
| `POST /api/v1/work-orders/:id/evidence` | `ADMIN`, `OPERATOR` | Subir foto/documento de diagnóstico al CAS (`SHA-256`) | `201`, `400`, `413` |
| `POST /api/v1/work-orders/:id/approvals` | `ADMIN`, `OPERATOR` | Registrar aprobación explícita del cliente sobre el presupuesto | `201`, `400`, `409` |
| `PATCH /api/v1/work-orders/:id/transition` | `ADMIN`, `OPERATOR` | Ejecutar transición FSM (`targetStatus`, `expectedVersion`, `payload` requerido por contrato) | `200`, `400`, `403`, **`409`** |
| `POST /api/v1/work-orders/:id/close` | `ADMIN`, `OPERATOR` | Cerrar orden verificada (`VERIFIED -> CLOSED`) y encolar `FiscalIntent` en `Fiscal Outbox` | `200`, `403`, **`409`** |

---

## 4. Contrato de Ejemplo: Bloqueo de Transición Inválida (`HTTP 409`)

Solicitud:
```json
PATCH /api/v1/work-orders/wo_01JXYZ/transition
{
  "targetStatus": "CLOSED",
  "expectedVersion": 3
}
```

Respuesta (`HTTP 409 Conflict`):
```json
{
  "ok": false,
  "error": {
    "code": "ERR_WORK_ORDER_APPROVAL_REQUIRED",
    "category": "VALIDATION",
    "message": "No se puede cerrar la orden: falta la aprobación explícita del cliente y la verificación técnica previa.",
    "retryable": false,
    "correlationId": "01934f0a-7c1b-7000-8000-000000000042",
    "details": {
      "currentStatus": "QUOTED",
      "requestedStatus": "CLOSED",
      "allowedTransitions": ["APPROVED", "CANCELLED"],
      "missingRequirements": ["customer_approval", "technical_verification"]
    }
  },
  "warnings": []
}
```

---

## 5. Requisitos de Accesibilidad y Resiliencia en UI Web

- Contraste mínimo WCAG 2.1 AA para uso bajo luz solar en campo (técnicos HVAC en azoteas/exteriores).
- Todos los formularios críticos mantienen borrador local en `sessionStorage` para evitar pérdida de mediciones si se cae el Wi-Fi momentáneamente (la sincronización offline completa con IndexedDB / PWA queda planificada para fase Pilotos Empresariales post-MVP).
- Cero renderizado de HTML sin escapar desde datos importados (defensa XSS frente a nombres o descripciones históricas de `Data Exodus`).
