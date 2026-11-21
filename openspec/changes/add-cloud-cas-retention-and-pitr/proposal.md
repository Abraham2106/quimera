# Almacenamiento CAS en S3/R2, retención fiscal de 5 años, Ley 8968 y respaldos PITR

## Why

En el demo local los artefactos de origen se almacenan en disco local y la retención fiscal de 5 años (1.825 días exigidos en Costa Rica) existe solo a nivel de metadato. Un SaaS B2B que resguarde comprobantes electrónicos, respuestas de Hacienda y evidencia de migración necesita almacenamiento durable en la nube compatible con S3/Cloudflare R2, inmutabilidad real (WORM/Object Lock y `REVOKE UPDATE, DELETE`), cumplimiento operativo de la Ley 8968 y respaldos PostgreSQL con Point-in-Time Recovery (PITR).

## What changes

Definir la capacidad `saas-storage-compliance` para un adaptador S3/R2 de `ArtifactStorePort` con verificación SHA-256 e inmutabilidad de 5 años (`QR-SEC-006`, `QR-SEC-010`), bloqueo de mutaciones en tablas de evidencia (`QR-SEC-005`), cuarentena/validación de archivos subidos (`QR-SEC-003`), gestión de PII conforme a la Ley 8968 (`QR-SEC-009`) y runbook/verificación automatizada de backups PITR.

## Impact

- Paquetes y apps afectados: `@quimera/data-exodus` (nuevo adaptador S3/R2 de `ArtifactStorePort` sin alterar el adaptador filesystem local), migraciones de privilegios SQL (`REVOKE UPDATE, DELETE` en tablas append-only `qum_*` y `fob_*`) y scripts de verificación de integridad y restauración.
- Mantiene el adaptador local en disco para `pnpm verify` y desarrollo offline.

## Fuera de alcance

- Asesoría legal o inscripción formal ante PRODHAB (requiere revisión legal externa).
- Selección comercial de proveedor cloud específico (el puerto admite cualquier bucket S3-compatible / Cloudflare R2).
