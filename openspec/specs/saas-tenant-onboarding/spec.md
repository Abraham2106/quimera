# saas-tenant-onboarding Specification

## Purpose

Describe el alta de una organización B2B, sus invitaciones de un solo uso, la protección del último administrador y la suspensión con exportación.

## Requirements

### Requirement: El aprovisionamiento B2B crea el tenant y su administrador inicial de forma atómica

El sistema SHALL crear una organización B2B, su perfil fiscal base normalizado (cédula física, jurídica, DIMEX o NITE) y la membresía inicial con rol `ADMIN` dentro de una única transacción, rechazando identificaciones inválidas antes de persistir datos.

#### Scenario: Alta exitosa de un taller PYME

- **WHEN** un usuario autenticado registra una organización con razón social, cédula jurídica válida y perfil de oficio soportado
- **THEN** el sistema crea el tenant aislado, asigna al creador como `ADMIN` y devuelve el identificador de organización listo para operar

#### Scenario: Cédula mal formada rechaza el alta sin dejar registros parciales

- **WHEN** se solicita crear una organización con una identificación fiscal inválida
- **THEN** la operación falla con HTTP `400` y no crea tenant ni membresía parcial en PostgreSQL

### Requirement: Las invitaciones de equipo usan tokens hasheados de un solo uso con expiración

El sistema SHALL permitir únicamente a un `ADMIN` del tenant emitir o revocar invitaciones, almacenar solo el hash del token con expiración obligatoria y rechazar con HTTP `410` o `409` cualquier intento de aceptar una invitación expirada, revocada o ya consumida.

#### Scenario: Aceptación válida agrega al miembro con el rol asignado

- **WHEN** un usuario autenticado acepta una invitación vigente y no revocada
- **THEN** queda vinculado exclusivamente al tenant emisor con el rol indicado y la invitación se marca consumida

#### Scenario: Reutilización de invitación ya aceptada es rechazada

- **WHEN** se intenta aceptar por segunda vez el mismo token de invitación
- **THEN** el sistema rechaza la solicitud sin duplicar membresías

### Requirement: Una organización no puede quedar sin administrador activo

El sistema SHALL impedir con HTTP `409` remover o degradar el rol del último `ADMIN` activo de un tenant, garantizando continuidad administrativa sobre la cuenta B2B.

#### Scenario: Intento de degradar al único ADMIN activo

- **WHEN** el único usuario `ADMIN` activo intenta cambiar su rol a `OPERATOR` o eliminarse de la organización
- **THEN** el sistema responde HTTP `409` y conserva su rol `ADMIN`

### Requirement: La suspensión bloquea mutaciones operativas sin impedir la exportación legal

Cuando un tenant pasa a estado `suspended`, el sistema SHALL rechazar nuevas mutaciones operativas con HTTP `403`, y SHALL mantener disponible la exportación de datos y la lectura de evidencia fiscal histórica para un `ADMIN`.

#### Scenario: Tenant suspendido intenta crear una orden de trabajo

- **WHEN** un miembro de una organización en estado `suspended` intenta crear o modificar una orden de trabajo
- **THEN** la API responde HTTP `403` mientras el `ADMIN` aún puede consultar y exportar sus registros históricos
