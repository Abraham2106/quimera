# Catálogo de Casos de Uso — QUIMERA

- **Documento:** `docs/02-product/use-cases.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Aprobado para trazabilidad con SRS y pruebas
- **Convenciones:** Cada caso de uso (`UC-01` a `UC-18`) referencia requisitos en [`docs/03-requirements/requirements-catalog.md`](../03-requirements/requirements-catalog.md) y pruebas en [`docs/08-quality/acceptance-tests.md`](../08-quality/acceptance-tests.md).

---

## Índice de Casos de Uso

| ID | Caso de uso | Componente principal | Prioridad MVP |
|---|---|---|---|
| `UC-01` | Importar archivo CSV | Data Exodus | Must |
| `UC-02` | Importar libro XLSX | Data Exodus | Must |
| `UC-03` | Interpretar comprobantes XML FE 4.4 | Data Exodus + `hacienda-sdk` | Must |
| `UC-04` | Analizar estructuras de datos (perfilado) | Data Exodus | Must |
| `UC-05` | Proponer correspondencias de esquema | Data Exodus | Must |
| `UC-06` | Detectar entidades duplicadas y contradicciones | Data Exodus | Must |
| `UC-07` | Registrar decisiones humanas de reconciliación | Data Exodus | Must |
| `UC-08` | Repetir una importación (idempotencia) | Data Exodus | Must |
| `UC-09` | Recuperarse de una importación interrumpida | Data Exodus + Pipeline | Must |
| `UC-10` | Migrar entidades reconciliadas hacia PostgreSQL | Data Exodus | Must |
| `UC-11` | Consultar servicios oficiales verificados (CR) | CR API Passport | Must |
| `UC-12` | Ejecutar un pipeline declarativo multi-etapa | QUIMERA Pipeline | Must |
| `UC-13` | Utilizar un módulo independientemente | Core / Todos los módulos | Must |
| `UC-14` | Crear y gestionar una orden de trabajo en OficiOS | OficiOS | Must |
| `UC-15` | Rechazar una transición inválida en OficiOS | OficiOS | Must |
| `UC-16` | Ejecutar suite de pruebas conductuales de Factura CI | Factura CI | Must |
| `UC-17` | Operar todo el baseline sin Clairic | Core / Pipeline / Data Exodus | Must |
| `UC-18` | Conectar Clairic opcionalmente para extracción estructurada | Clairic Adapter | Could (post-MVP / opcional) |

---

## UC-01 — Importar un archivo CSV

- **Actor:** Implementador de sistemas (`STK-04`) o Desarrollador (`STK-01`).
- **Objetivo:** Ingestar un archivo CSV con registros históricos preservando el archivo original inmutable, codificación, metadatos y filas crudas con trazabilidad.
- **Precondiciones:** Tenant inicializado (`tenantId`), PostgreSQL disponible, ruta de archivo CSV legible.
- **Disparador:** Ejecución de `quimera exodus ingest --source clientes.csv --tenant <id>` o invocación SDK `exodus.ingest()`.
- **Flujo principal:**
  1. El sistema calcula el hash SHA-256 del archivo y valida tamaño máximo y permisos de lectura.
  2. Almacena una copia inmutable en `ArtifactStorePort` (si el hash no existía) y registra `source_artifacts` e `import_batches` (`status = RUNNING`).
  3. Detecta delimitador (`,`, `;`, `\t`), codificación (UTF-8/UTF-8 BOM/Latin-1) y encabezados.
  4. Lee filas en streaming y persiste cada registro en `raw_records` con `row_number`, `record_fingerprint` (SHA-256 canónico) y payload JSONB saneado (neutralizando inyección de fórmulas CSV al exportar, preservando el valor crudo en evidencia).
  5. Registra conteo total, filas válidas y filas malformadas (en `raw_records` con estado `PARSE_ERROR`, nunca descartadas silenciosamente).
  6. Marca `import_batches.status = COMPLETED` y retorna `ExecutionResult`.
- **Flujos alternativos:**
  - *A1 (Sin encabezados):* El usuario pasa `--no-header`; el sistema asigna `col_0..col_n`.
  - *A2 (Delimitador explícito):* El usuario pasa `--delimiter ";"`, omitiendo autodetección.
- **Excepciones:**
  - *E1 (Archivo inexistente o ilegible):* Retorna error tipado `ERR_IO_NOT_FOUND` o `ERR_IO_PERMISSION` sin crear lote corrupto.
  - *E2 (Archivo vacío o binario corrupto):* Registra fallo explícito `ERR_PARSE_EMPTY_OR_BINARY` y marca el lote `FAILED`.
- **Postcondiciones:** Artefacto inmutable almacenado, 100% de filas trazables en `raw_records`, cero pérdida silenciosa.
- **Datos afectados:** `source_artifacts`, `import_batches`, `raw_records`, `provenance_entries`.
- **Requisitos asociados:** `QR-DATA-001`, `QR-DATA-002`, `QR-DATA-003`, `QR-SEC-003`.
- **Pruebas de aceptación:** `AT-01`, `T-DATA-001`, `T-SEC-003`.

---

## UC-02 — Importar un libro XLSX

- **Actor:** Implementador de sistemas (`STK-04`) o Desarrollador (`STK-01`).
- **Objetivo:** Ingestar una o varias hojas de un libro Excel `.xlsx` preservando nombre de hoja, coordenada de fila/celda, tipos numéricos/fechas y fórmulas evaluadas.
- **Precondiciones:** Tenant activo, PostgreSQL disponible, archivo `.xlsx` válido.
- **Disparador:** `quimera exodus ingest --source clientes.xlsx --sheet "Clientes" --tenant <id>` (o todas las hojas por defecto).
- **Flujo principal:**
  1. Calcula SHA-256 del archivo `.xlsx` y lo persiste en `ArtifactStorePort`.
  2. Abre el libro con `exceljs` en modo seguro (sin ejecutar macros VBA; rechaza archivos `.xlsm` si contienen macros activas no permitidas o advierte explícitamente extrayendo solo celdas).
  3. Itera cada hoja seleccionada, detecta la fila de encabezado (saltando encabezados decorativos vacíos si se configura) y normaliza fechas seriales de Excel a ISO-8601 con zona horaria `America/Costa_Rica` documentada.
  4. Persiste cada fila en `raw_records` con `source_locator = { sheet, rowNumber }` y guarda tanto el valor calculado como la fórmula cruda si existe (como metadato de evidencia).
  5. Marca filas completamente vacías como omitidas explícitamente en el resumen de conteo.
  6. Finaliza el lote con totales exactos por hoja.
- **Flujos alternativos:**
  - *A1 (Múltiples hojas):* Genera un `import_batch` padre o entradas etiquetadas por `sheet_name`.
  - *A2 (Celdas combinadas o fórmulas sin valor cacheado):* Registra advertencia `WARN_XLSX_UNCACHED_FORMULA` y crea conflicto de tipo `MISSING_OR_UNRESOLVED_VALUE`.
- **Excepciones:**
  - *E1 (Archivo protegido con contraseña o corrupto/ZIP bomb):* Rechaza de forma segura con `ERR_PARSE_PROTECTED_OR_MALFORMED` aplicando límite de ratio de descompresión.
- **Postcondiciones:** Todas las hojas y filas no vacías registradas con coordenada exacta `sheet!row`.
- **Datos afectados:** `source_artifacts`, `import_batches`, `raw_records`, `provenance_entries`.
- **Requisitos asociados:** `QR-DATA-001`, `QR-DATA-002`, `QR-DATA-004`, `QR-SEC-003`.
- **Pruebas de aceptación:** `AT-02`, `T-DATA-002`.

---

## UC-03 — Interpretar comprobantes XML (FE 4.4)

- **Actor:** Implementador (`STK-04`) o Desarrollador (`STK-01`).
- **Objetivo:** Ingestar comprobantes electrónicos XML de Costa Rica (Factura Electrónica, Tiquete, Notas de Crédito/Débito, etc.) reutilizando el parser de `@dojocoding/hacienda-sdk` y vinculando emisor, receptor, líneas, totales y clave de 50 dígitos.
- **Precondiciones:** Tenant activo, uno o más archivos `.xml` de comprobantes electrónicos.
- **Disparador:** `quimera exodus ingest --source ./facturas/*.xml --format hacienda-xml --tenant <id>`.
- **Flujo principal:**
  1. Calcula SHA-256 de cada XML y guarda la copia cruda inmutable en `ArtifactStorePort`.
  2. Verifica seguridad XML (rechaza `DOCTYPE` / entidades externas para prevenir XXE).
  3. Invoca `parseDocumentXml()` de `@dojocoding/hacienda-sdk` para extraer versión (4.4 / 4.3 detectada), tipo de comprobante, `clave` de 50 dígitos, `numeroConsecutivo`, fecha de emisión, emisor, receptor, moneda, tipo de cambio, líneas (CAByS, cantidad, precio, IVA) y resumen monetario.
  4. Persiste el comprobante y sus líneas como `raw_records` con `source_locator = { xpath, clave }`.
  5. Si el XML es versión 4.3 heredada, registra advertencia `WARN_XML_LEGACY_V43` y conserva los campos compatibles sin descartarlo.
  6. Si se solicita `--verify-signature` con pin de certificado, invoca `verifySignedDocumentXml()` registrando el resultado como evidencia (sin afirmar aceptación fiscal ante Hacienda).
- **Flujos alternativos:**
  - *A1 (XML de Respuesta de Hacienda `MensajeHacienda`):* Se detecta por elemento raíz y se vincula a la misma `clave` como evidencia de estado fiscal histórico.
- **Excepciones:**
  - *E1 (XML con `DOCTYPE`/XXE):* Bloqueo inmediato `ERR_SEC_XXE_REJECTED`.
  - *E2 (XML malformado o no fiscal):* Se guarda en `raw_records` con estado `PARSE_ERROR` y código `ERR_XML_INVALID_SCHEMA`.
- **Postcondiciones:** Comprobantes fiscales interpretados sin reescribir lógica del SDK y enlazados por `clave`.
- **Datos afectados:** `source_artifacts`, `import_batches`, `raw_records`, `provenance_entries`.
- **Requisitos asociados:** `QR-DATA-001`, `QR-DATA-005`, `QR-SEC-003`.
- **Pruebas de aceptación:** `AT-03`, `T-DATA-003`.

---

## UC-04 — Analizar estructuras de datos (Perfilado)

- **Actor:** Implementador (`STK-04`) o Desarrollador (`STK-01`).
- **Objetivo:** Inspeccionar automáticamente los `raw_records` ingestados para conocer tipos inferidos, nulos, cardinalidad, formatos de fecha/moneda, patrones costarricenses (cédulas físicas/jurídicas, teléfonos CR, códigos CAByS, claves de 50 dígitos) y anomalías.
- **Precondiciones:** Existen uno o más `import_batches` en estado `COMPLETED`.
- **Disparador:** `quimera exodus profile --batch <batchId>` (o sobre todos los lotes de un proyecto de migración).
- **Flujo principal:**
  1. Escanea los `raw_records` del lote o proyecto.
  2. Calcula por columna/campo: tasa de nulos, valores distintos, longitudes min/max, patrones regex deterministas (cédula CR 9–12 dígitos, correo, moneda `₡`/`$`/`CRC`/`USD`, fechas `dd/mm/yyyy` vs `yyyy-mm-dd`, clave 50 dígitos).
  3. Detecta problemas estructurales (fechas mixtas, símbolos monetarios mezclados en una misma columna, columnas duplicadas).
  4. Persiste un `SchemaProfile` versionado y genera salida legible en terminal o `--json`.
- **Flujos alternativos:**
  - *A1 (Muestreo en archivos grandes >100k filas):* Permite `--sample 10000` marcando el perfil como estimado.
- **Excepciones:**
  - *E1 (Lote inexistente o de otro tenant):* Retorna `ERR_NOT_FOUND` respetando aislamiento multi-tenant.
- **Postcondiciones:** Perfil estructural persistido y listo para proponer correspondencias.
- **Datos afectados:** `schema_profiles`, `execution_runs`.
- **Requisitos asociados:** `QR-DATA-006`, `QR-CORE-004`.
- **Pruebas de aceptación:** `AT-04`, `T-DATA-004`.

---

## UC-05 — Proponer correspondencias de esquema

- **Actor:** Implementador (`STK-04`) o Agente de programación (`STK-02`).
- **Objetivo:** Generar una propuesta revisable de mapeo entre columnas fuente y entidades canónicas destino (`customer`, `equipment`, `invoice`, `payment`, `work_order`, etc.).
- **Precondiciones:** `SchemaProfile` generado (`UC-04`) y esquema destino registrado (`SchemaVersion`).
- **Disparador:** `quimera exodus map propose --project <id> --target oficios-v1`.
- **Flujo principal:**
  1. Aplica reglas deterministas de emparejamiento por nombre normalizado (diccionario español/inglés CR: `ced`, `cedula`, `identificacion`, `razon_social`, `tel`, `celular`, `monto`, `saldo`) y por firma de datos observada en `SchemaProfile`.
  2. Asigna a cada correspondencia propuesta un puntaje de confianza (`0.0–1.0`), justificación explícita (regla disparada) y transformación sugerida (ej. `parse_cr_currency`, `normalize_cr_id`).
  3. Marca las correspondencias de baja confianza (`< 0.80`) o ambiguas (dos columnas compiten por el mismo campo destino) como `NEEDS_REVIEW`.
  4. Emite un manifiesto editable (`mapping.yaml` / registro en BD) sin aplicarlo automáticamente hasta confirmación.
- **Flujos alternativos:**
  - *A1 (Clairic habilitado opcionalmente):* Si el usuario activa `--extractor clairic`, solicita sugerencias adicionales solo para columnas sin match determinista, marcando su procedencia como `AI_SUGGESTED` y exigiendo confirmación humana.
- **Excepciones:**
  - *E1 (Campos obligatorios destino sin candidato):* Reporta el faltante explícitamente (`WARN_MAPPING_UNMAPPED_REQUIRED`).
- **Postcondiciones:** Propuesta de mapeo versionada y lista para aprobación o edición.
- **Datos afectados:** `transformation_rules`, `execution_runs`.
- **Requisitos asociados:** `QR-DATA-006`, `QR-CORE-007`.
- **Pruebas de aceptación:** `AT-05`, `T-DATA-005`.

---

## UC-06 — Detectar entidades duplicadas y contradicciones

- **Actor:** Implementador (`STK-04`) o Pipeline automatizado.
- **Objetivo:** Identificar duplicados exactos, duplicados probables, identidades contradictorias (mismo nombre con distinta cédula o misma cédula con distinto nombre), facturas repetidas, pagos mal atribuidos y saldos imposibles de reconciliar.
- **Precondiciones:** Mapeo aprobado (`UC-05`) aplicado a fase de staging/normalización.
- **Disparador:** `quimera exodus reconcile --project <id>`.
- **Flujo principal:**
  1. Normaliza cadenas (mayúsculas, sin tildes, sin sufijos societarios `S.A.`, `S.R.L.`, `LTDA` para comparación secundaria conservando el nombre legal original).
  2. **Duplicados exactos** (misma `clave` de 50 dígitos, misma cédula + mismo nombre normalizado, o mismo hash de transacción): aplica regla determinista `AUTO_MERGE` registrando ambos orígenes en procedencia.
  3. **Duplicados probables** (ej. «Distribuidora Rodríguez» vs «Distribuidora Rodríguez S.A.» con similitud de trigramas/Jaro-Winkler ≥ umbral y sin cédula contradictoria): crea `Conflict(type = PROBABLE_DUPLICATE, severity = MEDIUM, status = OPEN)` **sin fusionar automáticamente**.
  4. **Contradicciones duras** (mismo cliente con cédulas distintas, factura con totales distintos para igual clave, pago sin factura o suma incompatible de saldos): crea `Conflict(severity = HIGH/BLOCKING, status = OPEN)`.
  5. Genera informe resumen cuantificado por tipo de conflicto y severidad.
- **Flujos alternativos:**
  - *A1 (Cero conflictos detectados):* El proyecto queda listo directamente para carga (`UC-10`).
- **Excepciones:**
  - *E1 (Moneda faltante en un monto):* Crea conflicto `CURRENCY_AMBIGUOUS` en lugar de asumir CRC silenciosamente.
- **Postcondiciones:** Todos los conflictos persistidos con referencias exactas a los `raw_records` implicados; ninguna entidad ambigua fusionada en silencio.
- **Datos afectados:** `normalized_entities`, `conflicts`, `conflict_evidence`, `provenance_entries`.
- **Requisitos asociados:** `QR-DATA-007`, `QR-DATA-009`, `QR-DATA-010`, `QR-CORE-006`.
- **Pruebas de aceptación:** `AT-06`, `T-DATA-006`, `T-DATA-007`.

---

## UC-07 — Registrar decisiones humanas de reconciliación

- **Actor:** Implementador (`STK-04`), Dueño PYME (`STK-05`) o Auditor (`STK-08`).
- **Objetivo:** Resolver explícitamente cada conflicto abierto (fusionar, mantener separados, elegir valor canónico, marcar excepción irreconciliable/cuarentena) dejando registro auditable de actor, fecha, motivo y regla.
- **Precondiciones:** Existen conflictos con `status = OPEN` (`UC-06`).
- **Disparador:** `quimera exodus conflicts resolve <conflictId> --action merge --canonical <entityId> --reason "Confirmado por contabilidad"` o mediante interfaz interactiva CLI/web.
- **Flujo principal:**
  1. Muestra ambos/todos los registros implicados con su archivo origen, fila/xpath y valores en disputa.
  2. Valida que la acción elegida sea permitida para el tipo de conflicto (`MERGE`, `KEEP_SEPARATE`, `SELECT_VALUE`, `QUARANTINE_UNRECONCILABLE`).
  3. En una transacción ACID: inserta `resolution_decisions` (inmutable), actualiza `conflicts.status = RESOLVED` (o `QUARANTINED`), actualiza las entidades normalizadas y agrega entradas de `provenance_entries` enlazando la decisión.
  4. Recalcula si quedan conflictos bloqueantes pendientes para habilitar la migración destino.
- **Flujos alternativos:**
  - *A1 (Resolución por lote con archivo de decisiones versionado):* Permite aplicar `decisions.yaml` para reproducibilidad total en pruebas o re-ejecuciones.
  - *A2 (Saldo imposible de reconciliar):* Se marca explícitamente `QUARANTINE_UNRECONCILABLE` con observación obligatoria; se carga el registro de excepción sin falsear el saldo contable.
- **Excepciones:**
  - *E1 (Conflicto ya resuelto):* Rechaza sobrescritura directa (`ERR_CONFLICT_ALREADY_RESOLVED`); exige crear una decisión de enmienda (`SUPERSEDES`) para nunca borrar historial.
- **Postcondiciones:** Decisión persistida inmutablemente; procedencia actualizada; reproducibilidad garantizada.
- **Datos afectados:** `resolution_decisions`, `conflicts`, `normalized_entities`, `provenance_entries`.
- **Requisitos asociados:** `QR-DATA-009`, `QR-DATA-010`, `QR-DATA-011`, `QR-CORE-006`.
- **Pruebas de aceptación:** `AT-07`, `T-DATA-007`.

---

## UC-08 — Repetir una importación (Idempotencia)

- **Actor:** Implementador (`STK-04`) o Pipeline automatizado.
- **Objetivo:** Re-ejecutar la importación del mismo conjunto de archivos (o un subconjunto ya importado) sin crear registros duplicados, sin perder decisiones humanas previas y produciendo el mismo estado final.
- **Precondiciones:** Un archivo o lote idéntico ya fue importado anteriormente en el mismo tenant.
- **Disparador:** Re-ejecución de `quimera exodus ingest` o `quimera pipeline run` con los mismos archivos.
- **Flujo principal:**
  1. Calcula `sha256` del archivo y `record_fingerprint` por fila.
  2. Detecta que el artefacto y los fingerprints ya existen para ese `(tenant_id, project_id)`.
  3. No duplica `source_artifacts` ni `raw_records`; registra una ejecución de tipo `NOOP_IDEMPOTENT` (o procesa únicamente las filas nuevas/modificadas si el archivo creció).
  4. Preserva las `resolution_decisions` previas y reaplica exactamente las mismas reglas deterministas.
  5. Retorna conteo `inserted: 0, unchanged: N, updated: 0`.
- **Flujos alternativos:**
  - *A1 (Archivo modificado con filas nuevas y filas previas):* Genera nuevo `source_artifact` (nuevo SHA-256), omite registros idénticos por clave de negocio/fingerprint y procesa solo el delta.
- **Excepciones:**
  - *E1 (Cambio de versión de esquema destino incompatible):* Advierte y exige confirmación o migración de esquema (`ERR_SCHEMA_INCOMPATIBLE`).
- **Postcondiciones:** Cero duplicados introducidos; conteos e identidades idénticos a la ejecución anterior.
- **Datos afectados:** `execution_runs` (solo registro de auditoría de la corrida repetida).
- **Requisitos asociados:** `QR-DATA-008`, `QR-PIPE-005`.
- **Pruebas de aceptación:** `AT-08`, `T-DATA-008`.

---

## UC-09 — Recuperarse de una importación interrumpida

- **Actor:** Implementador (`STK-04`) o Operador de infraestructura (`STK-10`).
- **Objetivo:** Reanudar una importación o pipeline que fue interrumpido a mitad de ejecución (caída de proceso, pérdida de conexión a PostgreSQL, `SIGINT`) sin dejar escrituras parciales inconsistentes ni reprocesar innecesariamente bloques confirmados.
- **Precondiciones:** Existe una ejecución `execution_runs` en estado `INTERRUPTED` o `FAILED` con checkpoints persistidos.
- **Disparador:** `quimera pipeline resume --run <runId>` o `quimera exodus ingest --resume <batchId>`.
- **Flujo principal:**
  1. Lee el último `checkpoint` confirmado atómicamente en PostgreSQL (ej. último `chunk_index` o etapa completada).
  2. Verifica la integridad del artefacto origen comparando su SHA-256 actual contra el registrado.
  3. Descarta o revierte cualquier escritura temporal no confirmada (cada chunk corre dentro de su propia transacción).
  4. Retoma el procesamiento desde `last_committed_offset + 1` aplicando inserciones idempotentes (`ON CONFLICT DO NOTHING / DO UPDATE` controlado).
  5. Completa la ejecución actualizando `status = COMPLETED` y dejando evidencia de la recuperación en el log de corrida.
- **Flujos alternativos:**
  - *A1 (El usuario decide reiniciar desde cero):* `--restart` marca el run fallido como `SUPERSEDED` e inicia uno nuevo limpio sin borrar auditoría.
- **Excepciones:**
  - *E1 (El archivo origen cambió en disco antes de reanudar):* Aborta con `ERR_ARTIFACT_HASH_MISMATCH` para evitar mezclar versiones de archivo.
- **Postcondiciones:** Estado final idéntico al de una ejecución ininterrumpida, verificado por conteos y hashes.
- **Datos afectados:** `execution_runs`, `checkpoints`, `raw_records`, `normalized_entities`.
- **Requisitos asociados:** `QR-DATA-012`, `QR-PIPE-004`, `QR-NFR-003`.
- **Pruebas de aceptación:** `AT-09`, `T-DATA-012`, `T-PIPE-004`.

---

## UC-10 — Migrar hacia PostgreSQL

- **Actor:** Implementador (`STK-04`) o Desarrollador (`STK-01`).
- **Objetivo:** Cargar las entidades normalizadas y reconciliadas en el esquema operativo destino de PostgreSQL de forma atómica, emitiendo el informe de conciliación y habilitando consultas de procedencia.
- **Precondiciones:** Fase de reconciliación ejecutada (`UC-06`) y cero conflictos con `severity = BLOCKING` en estado `OPEN` (o modo `--quarantine-unresolved` explícito).
- **Disparador:** `quimera exodus migrate --project <id> --target-dsn <postgres-url> [--dry-run]`.
- **Flujo principal:**
  1. Verifica precondiciones (esquema destino migrado, conflictos bloqueantes resueltos, `tenantId` válido).
  2. En modo `--dry-run`, ejecuta la transacción dentro de un bloque con `ROLLBACK` final e imprime el plan exacto de inserciones/actualizaciones y reporte de conciliación.
  3. En ejecución real, inserta entidades normalizadas, relaciones, saldos conciliados y tabla de excepciones en cuarentena dentro de una transacción ACID por unidad de consistencia.
  4. Persiste el enlace `entity_id ↔ provenance_entries` y el reporte de conciliación final (`reconciliation_reports`) con checksums de totales (conteo de clientes, suma de facturas, suma de pagos, diferencias explicadas).
  5. Verifica invariantes post-carga (integridad referencial, sumas monetarias exactas con `NUMERIC`, cero registros huérfanos no declarados).
- **Flujos alternativos:**
  - *A1 (Existen excepciones en cuarentena aprobadas en `UC-07`):* Se cargan en tabla `quarantined_exceptions` separada, visible en reportes y en UI de auditoría, sin contaminar los saldos operativos.
- **Excepciones:**
  - *E1 (Conflicto bloqueante aún abierto):* Rechaza migrar con `ERR_MIGRATION_BLOCKED_BY_CONFLICTS` listando los IDs pendientes.
  - *E2 (Fallo de restricción FK/CHECK en PostgreSQL):* Rollback completo de la transacción, cero datos parciales.
- **Postcondiciones:** Base PostgreSQL operativa poblada, informe de conciliación generado y trazabilidad 100% consultable.
- **Datos afectados:** Tablas operativas destino, `reconciliation_reports`, `provenance_entries`, `execution_runs`.
- **Requisitos asociados:** `QR-DATA-011`, `QR-DATA-013`, `QR-DATA-014`.
- **Pruebas de aceptación:** `AT-10`, `T-DATA-013`.

---

## UC-11 — Consultar servicios oficiales verificados (CR API Passport)

- **Actor:** Desarrollador (`STK-01`), Agente IA (`STK-02`), Data Exodus u OficiOS.
- **Objetivo:** Consultar APIs oficiales costarricenses (contribuyentes de Hacienda, catálogo CAByS, tipo de cambio Hacienda / BCCR SDDE) mediante adaptadores tipados que aplican caché, límites de tasa y detección de deriva contractual.
- **Precondiciones:** Pasaporte registrado en `@quimera/cr-api-passport`; si se consulta BCCR SDDE, variable `BCCR_SDDE_TOKEN` configurada.
- **Disparador:** `quimera passport call hacienda-cabys --query "mantenimiento aire acondicionado"` o `quimera passport verify --all`, o llamada SDK.
- **Flujo principal:**
  1. El consumidor solicita una capacidad o pasaporte específico (`hacienda-taxpayer`, `hacienda-cabys`, `hacienda-exchange-rate`, `bccr-sdde-indicators`).
  2. El cliente verifica primero la política de credenciales (si la API exige Bearer Token como BCCR SDDE y falta, falla rápido con `ERR_AUTH_MISSING_CREDENTIALS` y guía oficial; nunca inventa datos).
  3. Consulta caché local respetando TTL configurado (ej. 24h contribuyentes/CAByS, 6h tipo de cambio).
  4. En caso de cache miss, solicita permiso al `RateLimiter` (configurado debajo de los límites oficiales de Hacienda: máx 15 req/s ráfaga, 8 req/s sostenido para evitar bloqueo de IP de 10 min).
  5. Ejecuta la llamada HTTP con timeout explícito, valida el payload recibido contra el esquema Zod/JSON Schema del pasaporte y retorna `{ data, meta: { passportVersion, fetchedAt, fromCache, driftWarnings } }`.
  6. En modo `verify`, compara la respuesta real o grabada contra el contrato del pasaporte y reporta explícitamente cualquier deriva (campo faltante, tipo cambiado, status HTTP inesperado).
- **Flujos alternativos:**
  - *A1 (Modo offline / mock determinista):* Con `--mode fixture`, usa fixtures verificados locales sin red.
  - *A2 (API externa devuelve `429` o `503`):* Si existe caché stale dentro de ventana de gracia, puede devolverlo marcado `stale: true` (si el consumidor lo permite) o retornar error tipado con `retryAfterMs`.
- **Excepciones:**
  - *E1 (Deriva incompatible detectada en respuesta):* Retorna `ERR_PASSPORT_CONTRACT_DRIFT` con diff estructurado del campo afectado.
  - *E2 (Consulta de API privada no afiliada, ej. Correos CR Pymexpress):* Informa que requiere contrato comercial y credenciales privadas sin simular éxito.
- **Postcondiciones:** Datos verificados entregados con metadatos de frescura y cero riesgo de abuso de tasa.
- **Datos afectados:** Caché local de respuestas (`passport_cache`), reporte de verificación de contratos.
- **Requisitos asociados:** `QR-PASS-001` a `QR-PASS-008`.
- **Pruebas de aceptación:** `AT-11`, `T-PASS-001` a `T-PASS-006`.

---

## UC-12 — Ejecutar un pipeline declarativo

- **Actor:** Desarrollador (`STK-01`), Implementador (`STK-04`) o CI/CD.
- **Objetivo:** Componer y ejecutar un flujo multi-etapa (ej. `ingest → profile → reconcile → [human-gate] → migrate → verify`) garantizando compatibilidad de contratos entre pasos, checkpoints y reanudación.
- **Precondiciones:** Archivo declarativo de pipeline (`pipeline.yaml`/`json`) válido y módulos requeridos instalados.
- **Disparador:** `quimera pipeline run ./pipelines/exodus-to-oficios.yaml --tenant <id>`.
- **Flujo principal:**
  1. Parsea el manifiesto y construye el DAG verificando que sea acíclico (rechaza ciclos).
  2. Valida compatibilidad estática entre `outputSchema` del paso productor y `inputSchema` del paso consumidor antes de iniciar ejecución.
  3. Ejecuta cada paso en orden topológico (o en paralelo cuando dos ramas son independientes), registrando `ExecutionRun` y `Checkpoint` tras cada paso completado.
  4. Si alcanza un paso con `gate: human_review` y existen conflictos bloqueantes abiertos, pausa el pipeline limpiamente en estado `WAITING_FOR_APPROVAL`, emitiendo el comando exacto para resolver y reanudar.
  5. Al completarse todos los pasos, emite reporte consolidado de tiempos, artefactos y estado final.
- **Flujos alternativos:**
  - *A1 (Cancelación por usuario):* `SIGINT` detiene la admisión de nuevos pasos, guarda checkpoint del último paso completo y marca `CANCELLED`.
- **Excepciones:**
  - *E1 (Contrato incompatible entre paso A y paso B):* Falla antes de ejecutar paso 1 con `ERR_PIPELINE_CONTRACT_MISMATCH`.
  - *E2 (Fallo transitorio en paso con política de reintento):* Reintenta únicamente si el paso declara `idempotent: true` y el error es transitorio; nunca reintenta pasos marcados `non_idempotent` sin reconciliación.
- **Postcondiciones:** Ejecución trazable paso a paso, reanudable y auditable.
- **Datos afectados:** `execution_runs`, `pipeline_step_runs`, `checkpoints`.
- **Requisitos asociados:** `QR-PIPE-001` a `QR-PIPE-007`.
- **Pruebas de aceptación:** `AT-12`, `T-PIPE-001` a `T-PIPE-005`.

---

## UC-13 — Utilizar un módulo independientemente

- **Actor:** Desarrollador (`STK-01`) o Contribuidor OSS (`STK-09`).
- **Objetivo:** Instalar y ejecutar un paquete individual (ej. `@quimera/data-exodus`, `@quimera/cr-api-passport` o `@quimera/factura-ci`) en un proyecto externo sin instalar `OficiOS`, `Clairic` ni el resto del ecosistema.
- **Precondiciones:** Entorno Node.js 22+ y gestor de paquetes (`pnpm`/`npm`).
- **Disparador:** `npm install @quimera/cr-api-passport` (o `@quimera/data-exodus`) seguido de importación ESM y ejecución.
- **Flujo principal:**
  1. El desarrollador instala únicamente el paquete deseado.
  2. El grafo de dependencias resuelve únicamente `@quimera/core` (cuando aplica) y dependencias externas explícitas de ese paquete.
  3. El módulo funciona completamente vía SDK y/o CLI propia sin requerir servicios, variables de entorno ni tablas de otros módulos.
- **Flujos alternativos:**
  - *A1 (Uso de `@quimera/factura-ci` en proyecto ajeno a QUIMERA):* Apunta a una URL HTTP local de la app fiscal del usuario sin importar ninguna librería de Data Exodus u OficiOS.
- **Excepciones:**
  - *E1 (Intento de invocar capacidad opcional no instalada, ej. Clairic):* Retorna error descriptivo `ERR_OPTIONAL_ADAPTER_NOT_INSTALLED` indicando el paquete opcional a instalar si se desea.
- **Postcondiciones:** Independencia verificada por pruebas de empaquetado aislado (`pnpm test:isolation`).
- **Datos afectados:** Ninguno de otros módulos.
- **Requisitos asociados:** `QR-CORE-002`, `QR-CORE-003`, `QR-NFR-008`.
- **Pruebas de aceptación:** `AT-13`, `T-CORE-002`, `T-CORE-003`.

---

## UC-14 — Crear y gestionar una orden de trabajo en OficiOS

- **Actor:** Operador de OficiOS (`STK-06`) / Dueño PYME (`STK-05`).
- **Objetivo:** Ejecutar el ciclo completo de una orden de servicio técnico de refrigeración/aire acondicionado sobre clientes y equipos migrados por Data Exodus, conservando evidencia, materiales, autorización y preparación del comprobante fiscal.
- **Precondiciones:** Base PostgreSQL poblada (por Data Exodus o alta directa), usuario autenticado en tenant.
- **Disparador:** Creación de orden desde la interfaz web/API de OficiOS (`POST /api/v1/work-orders`).
- **Flujo principal:**
  1. **Recepción (`RECEIVED`):** Selecciona cliente existente (mostrando si provino de Data Exodus y su enlace a procedencia), selecciona o registra equipo (marca, modelo, serie, ubicación, BTU) y síntoma reportado.
  2. **Diagnóstico (`DIAGNOSED`):** Registra mediciones técnicas (presión, temperatura, amperaje), notas de falla y evidencia fotográfica/adjunto con hash SHA-256.
  3. **Presupuesto y Autorización (`QUOTED → APPROVED`):** Crea presupuesto detallado (mano de obra + repuestos/refrigerante con código CAByS validado vía `CR API Passport`) y registra la autorización explícita del cliente (actor, fecha/hora, canal, monto aprobado).
  4. **Intervención (`IN_PROGRESS`):** Registra técnico asignado, actividades ejecutadas y materiales consumidos.
  5. **Verificación (`VERIFIED`):** Registra pruebas de funcionamiento post-reparación y conformidad del cliente.
  6. **Cierre (`CLOSED`):** Registra garantía, pago y encola intención de comprobante electrónico (vía `Fiscal Outbox` o adaptador simulado en modo offline).
- **Flujos alternativos:**
  - *A1 (Cliente rechaza presupuesto):* Transición `QUOTED → CANCELLED` con motivo de rechazo, permitiendo cobro solo de diagnóstico si aplica.
  - *A2 (Consulta de procedencia histórica):* Al abrir la ficha del cliente o saldo, el operador ve el origen exacto (archivos Excel/XML y decisiones de reconciliación) leído desde las vistas de procedencia.
- **Excepciones:**
  - *E1 (Falta conexión a Hacienda/Passport al buscar CAByS):* Usa caché local de Passport y advierte si es caché offline.
- **Postcondiciones:** Orden cerrada con cadena completa de evidencia, historial de transiciones e intención fiscal vinculada.
- **Datos afectados:** `work_orders`, `work_order_transitions`, `work_order_materials`, `work_order_approvals`, `work_order_evidences`, `fiscal_intents`.
- **Requisitos asociados:** `QR-OFI-001` a `QR-OFI-007`.
- **Pruebas de aceptación:** `AT-14`, `T-OFI-001` a `T-OFI-005`.

---

## UC-15 — Rechazar una transición inválida en OficiOS

- **Actor:** Operador de OficiOS (`STK-06`) o Cliente API externo.
- **Objetivo:** Garantizar que la máquina de estados de OficiOS bloquee explícitamente intentos de saltar etapas críticas (específicamente intentar cerrar o intervenir una orden sin autorización aprobada del cliente o sin verificación previa).
- **Precondiciones:** Existe una orden en estado `DIAGNOSED` o `QUOTED` sin registro de `work_order_approvals`.
- **Disparador:** Intento de transición `PATCH /api/v1/work-orders/:id/transition` hacia `CLOSED` (o `IN_PROGRESS` sin aprobación).
- **Flujo principal:**
  1. El motor de estados valida `(currentState, targetState)` contra la tabla de transiciones permitidas y las guardas de negocio (precondiciones de evidencia/aprobación).
  2. Detecta violación (ej. falta aprobación explícita del cliente para pasar a `IN_PROGRESS`/`CLOSED`).
  3. Rechaza la operación con HTTP `409 Conflict` y código tipado `ERR_WORK_ORDER_INVALID_TRANSITION`, detallando: estado actual, estado solicitado, transiciones válidas y requisito faltante en español comprensible.
  4. No modifica el estado de la orden ni dispara ninguna intención fiscal.
  5. Registra el intento bloqueado en auditoría de eventos.
- **Flujos alternativos:**
  - *A1 (El operador registra la aprobación faltante):* Reintenta la transición válida y el sistema permite continuar.
- **Excepciones:**
  - *E1 (Concurrencia optimista: dos operadores intentan transicionar la misma orden simultáneamente):* El segundo recibe `409 ERR_CONCURRENT_MODIFICATION` basado en columna `version`.
- **Postcondiciones:** Invariante operativa preservada; cero cierres sin autorización.
- **Datos afectados:** Ninguna mutación en `work_orders`; evento de auditoría opcional.
- **Requisitos asociados:** `QR-OFI-002`, `QR-OFI-003`, `QR-CORE-008`.
- **Pruebas de aceptación:** `AT-15`, `T-OFI-002`.

---

## UC-16 — Ejecutar pruebas conductuales con Factura CI

- **Actor:** Desarrollador (`STK-01`), Vibe Coder (`STK-02`) o Pipeline CI (GitHub Actions).
- **Objetivo:** Verificar que una aplicación de facturación electrónica (bajo prueba, SUT) cumple invariantes operativas críticas (concurrencia, idempotencia, recuperación ante timeout post-POST, manejo de estados, aislamiento multi-contribuyente y persistencia tras reinicio) contra un simulador determinista de Hacienda.
- **Precondiciones:** SUT accesible vía HTTP/adaptador de pruebas; suite de escenarios sintéticos de Factura CI disponible.
- **Disparador:** `quimera factura-ci run --target http://127.0.0.1:4000 --suite critical --json`.
- **Flujo principal:**
  1. Factura CI levanta un simulador determinista local de Hacienda (inspirado/reutilizando el protocolo loopback de `hacienda-cr/packages/mock`, nunca tocando sandbox real ni producción) con inyección programable de fallos (timeout TCP tras recibir POST, `409`, `429`, `503`, `procesando → aceptado`, `rechazado`).
  2. Ejecuta las familias de escenarios (`FC-001`..`FC-024`): concurrencia simultánea, reenvío tras timeout, evento de venta duplicado, reinicio simulado de worker, aislamiento entre `tenant-A` y `tenant-B`, corrección mediante Nota de Crédito vs mutación ilegal.
  3. Evalúa cada invariante observando tanto las respuestas de la SUT como las solicitudes recibidas en el simulador (ej. comprueba que solo llegó 1 clave única por venta y que ningún consecutivo se asignó dos veces).
  4. Emite un reporte estructurado en terminal y JSON/JUnit XML con código de salida `0` (APROBADA) o `1` (NO APROBADA) detallando cada código `FC-xxx` fallido.
- **Flujos alternativos:**
  - *A1 (Demo comparativa):* Se ejecuta contra `demo-pos-buggy` (reporta fallos `FC-017`, `FC-031`, etc.) y luego contra `demo-pos-outbox` (reporta 100% aprobado).
- **Excepciones:**
  - *E1 (SUT inalcanzable o no responde healthcheck):* Aborta antes de correr escenarios con `ERR_SUT_UNREACHABLE` (exit code `2`).
- **Postcondiciones:** Veredicto determinista reproducible en CI sin credenciales reales ni red externa.
- **Datos afectados:** Reporte de ejecución de pruebas (artefacto CI).
- **Requisitos asociados:** `QR-FCI-001` a `QR-FCI-008`.
- **Pruebas de aceptación:** `AT-16`, `T-FCI-001` a `T-FCI-008`.

---

## UC-17 — Trabajar sin Clairic (Operación Baseline sin IA)

- **Actor:** Todos los usuarios (`STK-01`..`STK-10`).
- **Objetivo:** Demostrar que la totalidad del flujo central de QUIMERA (`Core`, `Data Exodus`, `CR API Passport`, `Factura CI`, `Fiscal Outbox`, `Pipeline`, `OficiOS`) instala, prueba y opera completamente sin instalar `@quimera/adapter-clairic`, sin claves de API de IA y sin GPU.
- **Precondiciones:** Entorno Node 22 + PostgreSQL sin variables `CLOUDFLARE_API_TOKEN`, `CLAIRIC_ENDPOINT` ni paquete `@quimera/adapter-clairic`.
- **Disparador:** Ejecución de la suite de pruebas y demo end-to-end con `QUIMERA_AI_ENABLED=false` (valor por defecto).
- **Flujo principal:**
  1. Los módulos inicializan sin intentar importar `@quimera/adapter-clairic`.
  2. `Data Exodus` usa exclusivamente parsers deterministas (`csv-parse`, `exceljs`, `hacienda-sdk`) y reglas deterministas/difusas locales de matching.
  3. `Pipeline` completa todas las etapas y reportes sin degradación ni errores por ausencia de IA.
  4. `OficiOS` y `Factura CI` ejecutan el 100% de sus casos de uso.
- **Flujos alternativos:** Ninguno; es el modo por defecto.
- **Excepciones:**
  - *E1 (Usuario solicita explícitamente `--extractor clairic` sin tener el adaptador instalado):* Falla de forma clara con `ERR_OPTIONAL_ADAPTER_NOT_INSTALLED`.
- **Postcondiciones:** Cero llamadas de red a servicios de inferencia; 100% de casos de uso MVP aprobados.
- **Datos afectados:** Ninguno externo.
- **Requisitos asociados:** `QR-CORE-004`, `QR-CLAI-001`, `QR-CLAI-002`.
- **Pruebas de aceptación:** `AT-17`, `T-CORE-004`, `T-CLAI-001`.

---

## UC-18 — Conectar Clairic opcionalmente

- **Actor:** Desarrollador (`STK-01`) o Implementador (`STK-04`) en escenario avanzado/post-MVP.
- **Objetivo:** Habilitar `@quimera/adapter-clairic` como implementación opcional de `StructuredExtractorPort` para extraer campos tipados desde notas de texto libre, cotizaciones o imágenes de respaldo, preservando confianza (`confidence`, `p_null`), spans de evidencia y contención de prompt injection.
- **Precondiciones:** `@quimera/adapter-clairic` instalado explícitamente; configuración apuntando a Cloudflare Workers AI (`@cf/cloudflare/clairic`) o endpoint local compatible (o stub determinista en pruebas).
- **Disparador:** Configuración `extractor: "clairic"` en un paso opcional de ingestión de notas/adjuntos.
- **Flujo principal:**
  1. Valida límites del payload antes de enviar (máx 4 imágenes/páginas, ≤4 MiB c/u, ≤8 MiB decodificados, sin URLs remotas, dentro de límite de tokens).
  2. Construye la solicitud tipada `{ state, fields }` con esquemas estrictos y envía al proveedor configurado (nunca ejecutando código ni comandos desde el documento).
  3. Recibe valores tipados con `confidence`, `p_null`, `valid`, `complete` y character spans en `state`.
  4. Etiqueta todo dato extraído en `provenance_entries` con `origin_kind = AI_EXTRACTION`, `model_id`, `confidence` y `p_null`.
  5. Si `confidence < threshold` (por defecto `0.90`), `p_null > 0.15`, `complete === false` o el campo tiene impacto fiscal/financiero, genera automáticamente un `Conflict(type = AI_LOW_CONFIDENCE_OR_SENSITIVE)` para revisión humana obligatoria.
- **Flujos alternativos:**
  - *A1 (Timeout o indisponibilidad del endpoint preview de Workers AI):* Registra `WARN_EXTRACTOR_UNAVAILABLE` y deja el documento en cola manual sin bloquear el resto del pipeline.
- **Excepciones:**
  - *E1 (Documento supera 8 MiB o 4 páginas):* Rechaza localmente con `ERR_CLAIRIC_PAYLOAD_LIMIT` antes de transmitir.
  - *E2 (Intento de prompt injection dentro del texto fuente):* El adaptador solo acepta el mapa tipado `fields` predefinido y nunca otorga herramientas ni permisos de escritura automática al resultado.
- **Postcondiciones:** Datos extraídos marcados explícitamente como sugerencias verificables con spans y umbrales; jamás sobrescriben verdad verificada sin aprobación.
- **Datos afectados:** `raw_records`, `provenance_entries`, `conflicts`.
- **Requisitos asociados:** `QR-CLAI-001` a `QR-CLAI-004`, `QR-SEC-004`.
- **Pruebas de aceptación:** `AT-18`, `T-CLAI-002`, `T-SEC-004`.
