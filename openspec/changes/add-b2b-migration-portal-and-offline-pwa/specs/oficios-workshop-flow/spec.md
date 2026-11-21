## ADDED Requirements

### Requirement: El diagnóstico admite adjuntos fotográficos validados y almacenados por tenant

`OficiOS` SHALL permitir adjuntar evidencia fotográfica o PDF a un diagnóstico validando tipo MIME permitido y tamaño máximo, almacenando cada archivo con SHA-256 en `ArtifactStorePort` bajo el `tenant_id` de la orden y restringiendo su descarga únicamente a miembros autorizados del mismo tenant.

#### Scenario: Adjunto con tipo no permitido es rechazado

- **WHEN** se intenta subir un archivo ejecutable o superior al límite configurado a una orden de trabajo
- **THEN** la API responde HTTP `400` o `413` y no persiste el archivo en el almacén de artefactos
