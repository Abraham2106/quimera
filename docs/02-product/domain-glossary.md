# Glosario de Dominio — QUIMERA

- **Documento:** `docs/02-product/domain-glossary.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Lenguaje ubicuo de referencia para código, contratos y documentación

---

| Término | Identificador técnico sugerido | Definición precisa en QUIMERA | No confundir con |
|---|---|---|---|
| **Artefacto fuente** | `SourceArtifact` | Archivo o instantánea original inmutable ingresada a Data Exodus (CSV, XLSX, XML, etc.), identificada por su hash criptográfico `SHA-256`, metadatos de origen y URI en `ArtifactStorePort`. | Registro normalizado o archivo editado manualmente. |
| **Lote de importación** | `ImportBatch` | Ejecución acotada de ingestión de uno o más `SourceArtifact` dentro de un `tenantId` y `projectId`, con conteos de filas leídas, válidas, fallidas y estado terminal. | Ejecución completa de pipeline multi-etapa (`ExecutionRun`). |
| **Registro crudo** | `RawRecord` | Representación fiel de una fila, hoja o documento XML extraída de un `SourceArtifact`, con su localizador exacto (`rowNumber`, `sheet`, `xpath`) y `record_fingerprint`. | Entidad operativa limpia. |
| **Huella de registro** | `recordFingerprint` | Hash `SHA-256` canónico del contenido normalizado estructuralmente de un `RawRecord` (más su origen lógico) usado para idempotencia. | Firma digital legal o prueba de veracidad del dato. |
| **Entidad normalizada** | `NormalizedEntity` | Entidad de negocio reconstruida (ej. `Customer`, `Equipment`, `Invoice`, `Payment`) resultante de aplicar reglas de transformación y reconciliación sobre uno o más `RawRecord`. | Registro crudo sin validar. |
| **Procedencia** | `ProvenanceEntry` | Cadena verificable y consultable que conecta una entidad o campo con su `SourceArtifact`, `RawRecord`, localizador, regla de transformación, versión de esquema y decisión humana aplicada. | Un simple hash de archivo (un hash prueba integridad de bytes, no veracidad comercial). |
| **Conflicto** | `Conflict` | Ambigüedad, duplicado probable o contradicción detectada durante la normalización/reconciliación que no puede resolverse automáticamente sin riesgo de corrupción semántica. | Error de sintaxis o fallo de red. |
| **Decisión de reconciliación** | `ResolutionDecision` | Registro inmutable de cómo un actor (humano o regla determinista certificada) resolvió un `Conflict` (`MERGE`, `KEEP_SEPARATE`, `SELECT_VALUE`, `QUARANTINE_UNRECONCILABLE`), con motivo y marca temporal. | Edición destructiva en base de datos sin rastro. |
| **Cuarentena (excepción irreconciliable)** | `QuarantinedException` | Registro o saldo cuyas fuentes contienen contradicciones imposibles de conciliar matemáticamente; se aísla explícitamente con evidencia para revisión contable sin contaminar saldos operativos. | Borrado silencioso del registro. |
| **Pasaporte de API** | `ApiPassport` | Manifiesto técnico versionado de una API externa costarricense que declara endpoints, parámetros, esquema de respuesta, autenticación, rate limits oficiales, política de caché y casos de verificación. | Wrapper HTTP sin contrato ni pruebas. |
| **Deriva contractual** | `ContractDrift` | Discrepancia verificada entre el contrato declarado en un `ApiPassport` (basado en documentación oficial) y el comportamiento real observado (campos ausentes, cambios de tipo, status HTTP o casing). | Caída momentánea de red (`503`). |
| **Intención fiscal** | `FiscalIntent` | Registro transaccional que vincula una operación comercial única (`tenantId`, `environment`, `operationId`, `purpose`) con su ciclo de emisión fiscal para garantizar idempotencia comercial. | El comprobante XML firmado en sí. |
| **Consecutivo fiscal** | `FiscalSequence` | Numeración secuencial de 20 dígitos por `(issuerId, environment, documentType, branch, pos)` exigida por Hacienda CR; nunca debe duplicarse ni reutilizarse tras fallo. | ID autoincremental interno de aplicación. |
| **Estado incierto (ambiguo)** | `AmbiguousDeliveryState` | Resultado tras un `POST` a Hacienda en que ocurre timeout, caída de red o error 5xx y no se puede asegurar si el receptor recibió el comprobante; exige consulta por la misma `clave` antes de cualquier decisión. | Rechazo confirmado (`RECHAZADO`). |
| **Clave numérica (50 dígitos)** | `ClaveNumerica` | Identificador único reglamentario de un comprobante electrónico en Costa Rica (país `506`, fecha, cédula emisor, consecutivo, dígito de situación, código de seguridad). | Número interno de orden de trabajo. |
| **Emisor fiscal** | `IssuerId` | Identidad tributaria canónica `(idType, idNumber)` del contribuyente emisor; es la clave de partición obligatoria para consecutivos fiscales. | `tenantId` (dos tenants podrían compartir emisor o un tenant podría operar ambientes separados). |
| **Tenant** | `TenantId` | Frontera estricta de aislamiento lógico de datos, archivos, credenciales y permisos perteneciente a una empresa/cliente. | Usuario individual. |
| **SUT (System Under Test)** | `SUT` | Aplicación de facturación electrónica externa o demostrativa sometida a las pruebas conductuales de `Factura CI`. | `@dojocoding/hacienda-sdk`. |
| **Orden de trabajo** | `WorkOrder` | Unidad operativa central de `OficiOS` que recorre un ciclo de estados estricto (`RECEIVED → DIAGNOSED → QUOTED → APPROVED → IN_PROGRESS → VERIFIED → CLOSED`) con evidencia y compuertas verificables. | Factura electrónica. |
| **Contrato de oficio** | `TradeContract` | Especificación declarativa de campos técnicos, mediciones obligatorias, evidencias y guardas de transición propias de un oficio específico (ej. `hvac-refrigeration-v1`). | Formulario genérico sin validación de flujo. |
| **CAByS** | `CAByS` | Catálogo de Bienes y Servicios del BCCR/Hacienda de Costa Rica (código de 13 dígitos) obligatorio en cada línea de comprobantes electrónicos v4.4 para determinar la tarifa de IVA aplicable. | Código SKU interno del comercio. |
| **SDDE** | `BCCR SDDE` | Sistema de Divulgación de Datos Económicos del Banco Central de Costa Rica; API REST JSON con autenticación Bearer Token que reemplazó al Web Service deshabilitado el 30 de junio de 2026. | Antiguo servicio SOAP del BCCR (obsoleto). |
| **System One Extractor (Clairic)** | `StructuredExtractorPort` | Puerto opcional para extracción estructurada de campos tipados con puntaje de confianza y spans de texto, implementable opcionalmente mediante `@cf/cloudflare/clairic` o equivalente. | Chatbot conversacional o agente autónomo con permisos de escritura. |
