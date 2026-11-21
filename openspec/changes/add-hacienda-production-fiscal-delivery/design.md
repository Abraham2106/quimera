# Diseño técnico: Emisión fiscal real y bóveda KMS multi-tenant

## Separación de procesos y secretos (`QR-SEC-007`)

1. Crear un proceso worker separado (`fiscal-outbox-worker`) con acceso mínimo al almacén de secretos/KMS; ni el frontend web ni el servidor MCP reciben acceso a `.p12`, PIN ni `HACIENDA_PASSWORD`.
2. Almacenar los bytes del `.p12`, su PIN y las credenciales IDP cifrados mediante *envelope encryption* (DEK por tenant cifrada por KEK en KMS/Secret Manager). Registrar únicamente metadatos no sensibles en PostgreSQL (`cert_fingerprint_sha256`, `cert_valid_until`, `environment`, `emitter_id`).
3. Validar al cargar el certificado que es un PKCS#12 válido, que corresponde al emisor configurado y que no está expirado; emitir alerta operativa cuando falten ≤ 30 días para vencimiento.

## Ciclo de entrega con `@dojocoding/hacienda-sdk`

1. Por cada `FiscalIntent` reclamado mediante `claimNextDocument`:
   - Asignar consecutivo atómico en `fob_*` separado por `(tenant_id, emitter_id, environment, branch, terminal, doc_type)`.
   - Construir XML v4.4, validar XSD, firmar XAdES-EPES con el `.p12` del tenant y persistir el XML firmado en `ArtifactStorePort` (con su SHA-256) **antes** de emitir `POST /recepcion`.
   - Si ocurre timeout o error de red tras `POST`, marcar estado ambiguo y consultar `GET /recepcion/{clave}` antes de reintentar (nunca emitir una segunda clave para el mismo intento).
   - Persistir el XML de respuesta oficial de Hacienda (`aceptado` / `rechazado`) y su motivo en `ArtifactStorePort` y en el registro del comprobante.
2. Habilitar `ENABLE` y `FORCE ROW LEVEL SECURITY` sobre las tablas `fob_*` para impedir fugas de consecutivos o comprobantes entre tenants.

## Compuerta de activación `sandbox` → `production` (`QG-07`)

- Toda organización nueva inicia en `environment = 'sandbox'`.
- Cambiar un tenant a `environment = 'production'` exige verificación explícita previa de: al menos una emisión aceptada en sandbox con el perfil fiscal configurado, certificado de producción vigente y confirmación de un `ADMIN` con MFA.
