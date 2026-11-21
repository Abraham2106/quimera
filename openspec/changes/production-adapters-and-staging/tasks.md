## Almacenamiento CAS y factoría por entorno

- [x] Implementar cliente HTTP S3 con AWS SigV4 y retención Object Lock de 1.825 días sobre `S3ArtifactStore`.
- [x] Reemplazar el singleton fijo en `apps/oficios` por factoría `OFICIOS_ARTIFACT_STORE` (`memory` | `fs` | `s3`).
- [x] Añadir prueba loopback HTTP sin AWS real: integridad SHA-256, borrado rechazado dentro de retención y cuarentena.
- [x] Exportar adaptadores de almacenamiento desde `@quimera/data-exodus` sin romper aislamiento de paquetes.

## Bóveda KMS/local y certificados por tenant

- [x] Implementar bóveda con envelope encryption (KMS o clave local de staging) y ciphertext aislado por `tenant_id`.
- [x] Flujo `ADMIN` de carga y promoción de certificado `.p12` sin filtrar secretos en respuestas ni logs.
- [x] Pruebas de regresión que demuestren que operadores no `ADMIN` no pueden leer material de clave.

## Worker fiscal y transporte Hacienda

- [x] Seleccionar `HaciendaSdkTransport` o loopback por entorno en el worker de outbox fiscal.
- [x] Apagado ordenado con `SIGTERM` drenando leases activos antes de salir.
- [ ] Mantener `pnpm test:security` y Factura CI estrictamente loopback-only.

## Autenticación JWKS y webhooks de cobro

- [x] Publicar JWKS con claves RS256 y ES256 para validación de JWT de OficiOS.
- [x] Anti-replay en webhooks HMAC con ventana de marca de tiempo configurable.
- [x] Pruebas de token expirado, firma inválida y replay rechazado.

## Web estática y migraciones endurecidas

- [ ] Servir el bundle `web/dist` en staging/producción con cabeceras de seguridad.
- [ ] Hacer fallar `db:migrate` si el rol PostgreSQL es superusuario o tiene `BYPASSRLS`.

## Verificación global

- [ ] Ejecutar `pnpm verify` y `pnpm spec:validate` en verde con adaptadores productivos configurables.