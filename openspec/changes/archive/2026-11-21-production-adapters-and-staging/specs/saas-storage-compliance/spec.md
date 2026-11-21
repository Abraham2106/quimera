## MODIFIED Requirements

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