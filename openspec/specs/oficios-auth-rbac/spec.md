# oficios-auth-rbac Specification

## Purpose

Define cómo OficiOS identifica al actor fuera del modo de prueba local: token Bearer firmado, rechazo de cabeceras sintéticas y control de acceso por rol.

## Requirements

### Requirement: La API de OficiOS deriva identidad y rol únicamente de tokens firmados válidos

La API HTTP de `OficiOS` SHALL exigir un token `Authorization: Bearer` con firma criptográfica válida, vigencia no expirada y claims obligatorios (`tenant_id`, `role`, `sub`) para todas las rutas operativas fuera del modo de pruebas en loopback, y SHALL rechazar con HTTP `401` peticiones sin credenciales válidas.

#### Scenario: Petición con cabeceras suplantadas sin token válido es rechazada

- **WHEN** un cliente envía `x-tenant-id` y `x-test-role` sin un token Bearer válido fuera del modo de pruebas
- **THEN** la API responde HTTP `401` y no ejecuta ninguna lectura ni mutación

#### Scenario: Token expirado o con firma alterada es rechazado

- **WHEN** un cliente presenta un JWT expirado o con firma inválida
- **THEN** la API responde HTTP `401`

### Requirement: El control de acceso basado en roles impide acciones no autorizadas

`OficiOS` SHALL evaluar el rol verificado en el token antes de ejecutar aprobaciones, cambios de estado críticos o cierres fiscales, respondiendo HTTP `403` cuando el rol no tenga permiso.

#### Scenario: Rol sin permisos intenta cerrar una orden de trabajo

- **WHEN** un actor autenticado con un rol sin permiso de cierre solicita cerrar una orden verificada
- **THEN** la API responde HTTP `403` y no encola ningún `FiscalIntent`
