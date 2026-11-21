# saas-storage-compliance Specification

## Purpose

Describe el almacén de evidencia por tenant, la retención fiscal de 1825 días, la inmutabilidad de las tablas de evidencia y la seudonimización de datos personales no fiscales.

## Requirements

### Requirement: El almacén CAS en la nube verifica SHA-256 y aplica retención de 5 años a evidencia fiscal

El adaptador S3/R2 de `ArtifactStorePort` SHALL almacenar objetos bajo prefijo aislado por `tenant_id`, SHALL firmar peticiones HTTP con AWS SigV4 hacia un endpoint configurable compatible con S3, aplicar política de retención inmutable de al menos 1.825 días a artefactos fiscales y de evidencia de migración, y SHALL fallar con `ERR_ARTIFACT_INTEGRITY_FAILED` si el digest SHA-256 al leer difiere del registrado.

#### Scenario: Alteración de un byte en el objeto almacenado es detectada

- **WHEN** se lee para auditoría o reanudación un artefacto cuyo contenido almacenado no coincide con su SHA-256 esperado
- **THEN** el adaptador rechaza la lectura con `ERR_ARTIFACT_INTEGRITY_FAILED`

#### Scenario: Intento de eliminar un XML fiscal antes de 5 años es bloqueado

- **WHEN** un proceso intenta borrar un artefacto marcado con retención fiscal vigente (`retentionUntil > now`)
- **THEN** la eliminación es rechazada conservando intacto el documento

#### Scenario: Prueba loopback sin AWS valida PUT y GET íntegros

- **WHEN** la suite de pruebas ejecuta el adaptador S3 contra un servidor HTTP loopback local
- **THEN** un ciclo PUT seguido de GET devuelve bytes cuyo SHA-256 coincide sin contactar servicios AWS reales

### Requirement: Las tablas de evidencia y auditoría son append-only a nivel de base de datos

El rol de aplicación en PostgreSQL SHALL carecer de permisos `UPDATE` y `DELETE` sobre las tablas de artefactos, procedencia, decisiones de reconciliación e intentos fiscales, de modo que las correcciones solo puedan registrarse mediante nuevas filas que reemplazan la decisión anterior (`supersedes_decision_id`).

#### Scenario: Intento de DELETE directo sobre decisiones aplicadas falla en PostgreSQL

- **WHEN** el rol de aplicación intenta ejecutar `UPDATE` o `DELETE` sobre `qum_resolution_decisions` o `qum_provenance_entries`
- **THEN** PostgreSQL rechaza la sentencia por falta de privilegios

### Requirement: La gestión de datos personales cumple rectificación sin violar retención tributaria

El sistema SHALL permitir rectificar o seudonimizar atributos PII no fiscales de un contacto a solicitud de un `ADMIN` del tenant, SHALL redactar campos marcados `pii: true` en logs estructurados y SHALL preservar intactos los registros tributarios obligatorios durante su período legal de 5 años.

#### Scenario: Seudonimización de contacto conserva integridad de comprobantes históricos

- **WHEN** un `ADMIN` ejecuta la seudonimización de un contacto inactivo con comprobantes históricos dentro del plazo de 5 años
- **THEN** se eliminan datos de contacto no fiscales en el perfil operativo mientras los XML fiscales y sus hashes permanecen íntegros y trazables
