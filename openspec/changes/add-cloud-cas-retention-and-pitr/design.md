# Diseño técnico: Almacenamiento CAS en la nube, retención 5 años y PITR

## Adaptador S3/R2 de `ArtifactStorePort`

1. Prefijo estricto por tenant: `tenants/<tenant_id>/sha256/<ab>/<cd>/<sha256>` evitando colisiones y simplificando auditorías y borrados selectivos no fiscales.
2. En escritura: calcular SHA-256 en streaming, validar tamaño máximo, tipo MIME permitido y hook de escaneo antimalware en cuarentena antes de promover el objeto; aplicar encabezado de retención (`ObjectLockRetainUntilDate` = `now + 1825 days`) a artefactos clasificados como evidencia fiscal o fuente de migración.
3. En lectura crítica o auditoría (`verify-artifacts`): recalcular SHA-256 y fallar explícitamente con `ERR_ARTIFACT_INTEGRITY_FAILED` ante cualquier alteración de 1 byte.

## Inmutabilidad en PostgreSQL (`QR-SEC-005`) y Ley 8968 (`QR-SEC-009`)

1. Migración de privilegios que ejecute `REVOKE UPDATE, DELETE ON qum_artifacts, qum_provenance_entries, qum_resolution_decisions, fob_attempts FROM quimera` (complementando los repositorios append-only).
2. Flujo de rectificación y seudonimización de PII no fiscal (teléfonos, correos o notas en `ofi_customers` sin romper claves ni montos de comprobantes fiscales sujetos a retención legal de 5 años).

## Respaldos PITR y prueba de restauración

- PostgreSQL gestionado con backups diarios + archivado WAL continuo apuntando a RPO ≤ 5 min y RTO ≤ 30 min.
- Procedimiento automatizado periódico de restauración a una instancia efímera que verifica conteos de `qum_*`, `fob_*`, `ofi_*` y muestreo de integridad SHA-256.
