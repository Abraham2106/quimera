## Seguridad de secretos y RLS en fob_*

- [x] Agregar migración SQL habilitando `ENABLE` y `FORCE ROW LEVEL SECURITY` en todas las tablas `fob_*` más columnas de referencia a artefactos XML firmado y respuesta de Hacienda.
- [x] Implementar puerto `FiscalCredentialVaultPort` con *envelope encryption* (adaptador KMS para producción y adaptador local en memoria/efímero solo para tests).
- [x] Implementar validación de vigencia de `.p12` al subirlo y alerta preventiva a 30 días del vencimiento.

## Transporte Hacienda v4.4 y worker dedicado

- [ ] Implementar `HaciendaSdkTransport` sobre `@dojocoding/hacienda-sdk` (OAuth2, XML v4.4, validación XSD, firma XAdES-EPES, `POST /recepcion` y polling `GET /recepcion/{clave}`).
- [ ] Persistir XML firmado antes del `POST` y XML de respuesta oficial al alcanzar estado terminal (`aceptado`/`rechazado`).
- [x] Implementar compuerta explícita para promover un tenant de `sandbox` a `production` exigiendo aceptación previa en sandbox y rol `ADMIN`.

## Pruebas y verificación

- [ ] Probar el transporte completo contra el simulador loopback de `@quimera/factura-ci` (25/25) y agregar prueba opt-in `test:hacienda-sandbox` deshabilitada por defecto en `pnpm verify`.
- [x] Ejecutar `pnpm verify`, `pnpm test:security` y `pnpm spec:validate` en verde.
