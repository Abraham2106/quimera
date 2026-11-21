# hacienda-live-delivery Specification

## Purpose

Describe la bóveda de certificados por tenant, la firma y persistencia del XML antes del envío, la consulta de la misma clave tras un timeout y la compuerta de sandbox a producción.

## Requirements

### Requirement: Los certificados .p12 y credenciales IDP se protegen por tenant mediante envelope encryption

El sistema SHALL cifrar certificados `.p12`, PINs y contraseñas IDP por tenant usando un puerto de bóveda KMS, SHALL rechazar certificados vencidos o corruptos al registrarlos, y SHALL NOT exponer material criptográfico en logs, respuestas HTTP de la UI ni herramientas MCP.

#### Scenario: Certificado expirado es rechazado al configurarse

- **WHEN** un `ADMIN` intenta registrar un certificado `.p12` cuya fecha de expiración ya venció
- **THEN** el sistema rechaza la carga con error estructurado y no activa el emisor

#### Scenario: Credenciales fiscales nunca aparecen en respuestas API ni logs

- **WHEN** se consulta la configuración fiscal del tenant o ocurre un error de firma o autenticación
- **THEN** solo se exponen metadatos seguros (huella SHA-256, vigencia, ambiente) sin PIN, llave privada ni contraseña

### Requirement: La promoción a producción exige ambiente sandbox validado y activación explícita

Cada emisor B2B SHALL operar en `environment = sandbox` por defecto y SHALL impedir el cambio a `environment = production` hasta registrar validación exitosa en sandbox, certificado de producción vigente y aprobación explícita de un `ADMIN`.

#### Scenario: Intento de activar producción sin validación previa en sandbox

- **WHEN** un tenant solicita emitir en `production` sin haber completado su verificación previa en `sandbox`
- **THEN** el sistema rechaza la activación indicando el requisito pendiente (`QG-07`)

### Requirement: El worker fiscal persiste XML firmado antes de enviar y conserva la respuesta oficial

El proceso `fiscal-outbox-worker` SHALL validar XSD v4.4, firmar XAdES-EPES y almacenar el XML firmado con su SHA-256 antes de invocar `POST /recepcion`, SHALL consultar `GET /recepcion/{clave}` ante fallos ambiguos sin regenerar clave, y SHALL archivar el XML de respuesta oficial de Hacienda al llegar a estado terminal.

#### Scenario: Timeout durante POST no genera segunda clave ni segundo XML

- **WHEN** la llamada HTTP `POST /recepcion` sufre un corte de red tras el despacho
- **THEN** el worker consulta el estado de la misma clave ya persistida antes de decidir cualquier reintento
