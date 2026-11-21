## Almacenamiento S3/R2 y retención

- [x] Implementar adaptador `S3ArtifactStore` sobre `ArtifactStorePort` con prefijos por tenant, validación de tamaño/MIME, verificación SHA-256 (`ERR_ARTIFACT_INTEGRITY_FAILED`) y retención WORM/Object Lock de 1.825 días para evidencia fiscal.
- [x] Añadir hook de cuarentena/escaneo previo a ingestión de archivos subidos por usuarios B2B.

## Inmutabilidad SQL y Ley 8968

- [x] Crear migración SQL que revoque `UPDATE` y `DELETE` al rol de aplicación sobre tablas de evidencia append-only (`QR-SEC-005`).
- [x] Implementar flujo de rectificación y seudonimización de datos personales no fiscales respetando la retención tributaria de 5 años (`QR-SEC-009`, `QR-SEC-010`).

## Respaldos PITR y verificación

- [x] Documentar y automatizar la prueba de restauración PITR verificando integridad referencial y de hashes.
- [x] Agregar pruebas unitarias/integración con mock S3 local (`T-SEC-005`, `T-SEC-006`, `T-SEC-009`, `T-SEC-010`).
- [ ] Correr `pnpm verify` y `pnpm spec:validate`.
