## ADDED Requirements

### Requirement: El almacén de artefactos de OficiOS se selecciona por variable de entorno sin romper pruebas offline

El servidor `apps/oficios` SHALL construir su implementación de `ArtifactStorePort` según `OFICIOS_ARTIFACT_STORE`, usando `memory` por defecto cuando `NODE_ENV=test` o `OFICIOS_AUTH_MODE=test-headers`, `fs` cuando apunta a `OFICIOS_ARTIFACT_DIR`, y `s3` con endpoint y credenciales configurables cuando se selecciona almacenamiento objeto compatible con S3.

#### Scenario: La suite de pruebas opera en memoria sin credenciales cloud

- **WHEN** se ejecuta la suite de pruebas con `NODE_ENV=test` o `OFICIOS_AUTH_MODE=test-headers` sin `OFICIOS_ARTIFACT_STORE`
- **THEN** OficiOS usa `InMemoryArtifactStore` y no requiere red ni credenciales AWS

#### Scenario: Staging selecciona almacenamiento S3 por entorno

- **WHEN** se configura `OFICIOS_ARTIFACT_STORE=s3` con `OFICIOS_S3_ENDPOINT`, bucket, región y claves de acceso
- **THEN** los adjuntos y cargas del portal persisten mediante `S3ArtifactStore` firmando peticiones AWS SigV4

### Requirement: El adaptador S3 en loopback verifica integridad, retención fiscal y cuarentena sin llamar a AWS real

El cliente HTTP del adaptador S3 SHALL ejecutar PUT, GET y DELETE sobre un endpoint configurable, SHALL conservar el digest SHA-256 entre escritura y lectura, SHALL rechazar borrados de evidencia fiscal dentro de 1.825 días y SHALL respetar un hook de cuarentena que bloquea la persistencia de objetos rechazados.

#### Scenario: PUT seguido de GET devuelve los mismos bytes hashados

- **WHEN** se almacena un artefacto y luego se lee por `storageUri`
- **THEN** el SHA-256 calculado en lectura coincide con el registrado en la escritura

#### Scenario: Borrado dentro del período de retención fiscal es rechazado

- **WHEN** un proceso intenta borrar un artefacto de evidencia fiscal cuya fecha de retención aún no venció
- **THEN** la operación falla sin eliminar el objeto

#### Scenario: Cuarentena impide persistir un archivo bloqueado

- **WHEN** el hook de cuarentena marca un archivo como rechazado antes de `put`
- **THEN** el adaptador devuelve error y no crea el objeto en el bucket

### Requirement: Los secretos y certificados fiscales por tenant se protegen con bóveda KMS o local sin filtrar material sensible

El sistema SHALL cifrar credenciales IDP y archivos `.p12` por `tenant_id` usando AWS KMS o una bóveda local equivalente en staging, SHALL permitir que un `ADMIN` cargue y promueva certificados sin exponer contraseñas ni claves privadas en respuestas HTTP o logs estructurados, y SHALL rechazar lecturas de material de clave por roles no autorizados.

#### Scenario: Subida de certificado por ADMIN no filtra secretos

- **WHEN** un `ADMIN` sube un certificado `.p12` válido para su tenant
- **THEN** la API confirma la promoción devolviendo solo metadatos no sensibles y persiste ciphertext en la bóveda

#### Scenario: Operador sin rol ADMIN no obtiene material de clave

- **WHEN** un usuario `OPERATOR` solicita el contenido de un certificado almacenado
- **THEN** la operación es rechazada sin revelar passphrase ni bytes del `.p12`

### Requirement: El worker fiscal selecciona transporte Hacienda o loopback y termina ordenadamente ante SIGTERM

El proceso worker del outbox fiscal SHALL enviar comprobantes usando `HaciendaSdkTransport` cuando esté configurado para entornos productivos o SHALL usar transporte loopback en CI y desarrollo offline, y SHALL drenar leases activos antes de salir cuando recibe `SIGTERM`.

#### Scenario: CI mantiene transporte loopback exclusivo

- **WHEN** `pnpm verify` ejecuta el worker fiscal en entorno de prueba
- **THEN** ninguna llamada sale a endpoints reales del Ministerio de Hacienda

#### Scenario: Apagado grácil drena trabajo pendiente

- **WHEN** el worker recibe `SIGTERM` con intentos de envío en curso
- **THEN** completa o libera leases de forma segura antes de terminar el proceso

### Requirement: La autenticación expone JWKS RS256/ES256 y los webhooks de cobro resisten replay por marca de tiempo

OficiOS SHALL publicar un documento JWKS con claves RS256 y ES256 para validar JWT de sesión, y los endpoints de webhooks de cobro SHALL verificar firma HMAC y rechazar eventos cuya marca de tiempo quede fuera de la ventana anti-replay configurada.

#### Scenario: Token firmado con clave ES256 válida es aceptado

- **WHEN** un cliente presenta un JWT firmado con una clave ES256 publicada en JWKS dentro de su vigencia
- **THEN** la API establece el contexto de tenant y rol del token

#### Scenario: Webhook con marca de tiempo expirada es rechazado

- **WHEN** un proveedor de cobro envía un webhook HMAC con marca de tiempo fuera de la ventana permitida
- **THEN** la API responde error sin procesar el evento de facturación

### Requirement: El bundle web de la PWA se sirve como dist estático en staging

El servidor de OficiOS SHALL servir los activos compilados de `apps/oficios/web/dist` para rutas no API en despliegues de staging y producción, aplicando cabeceras de seguridad para contenido estático.

#### Scenario: Ruta raíz entrega el shell de la PWA

- **WHEN** un navegador solicita `/` en un despliegue con `dist` generado
- **THEN** recibe el HTML de entrada de la PWA y los recursos estáticos asociados

### Requirement: Las migraciones rechazan roles superusuario o con BYPASSRLS

El comando `db:migrate` SHALL abortar antes de aplicar migraciones si la conexión PostgreSQL usa un rol con atributo `SUPERUSER` o `BYPASSRLS`, exigiendo el rol de aplicación endurecido del baseline QUIMERA.

#### Scenario: Migrar con rol superusuario falla de forma inmediata

- **WHEN** un operador ejecuta `db:migrate` con un rol PostgreSQL superusuario
- **THEN** el comando termina con error sin modificar el esquema