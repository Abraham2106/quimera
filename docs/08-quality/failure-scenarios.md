# Escenarios de Fallo y Suite de Factura CI — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Listo para implementación
- **Referencias:** [ADR-010](../04-architecture/ADR/ADR-010-fiscal-testing-and-outbox-boundaries.md) | [Confiabilidad y Recuperación](../07-security/reliability-and-recovery.md) | [Requisitos QR-FCI y QR-OUT](../03-requirements/requirements-catalog.md)

---

## 1. Frontera Explícita: Qué Comprueba `hacienda-sdk` vs Qué Comprueba `Factura CI`

Para evitar duplicación de esfuerzo con `DojoCodingLabs/hacienda-cr@0.13.0` (`ADR-010`):

| Responsabilidad | `@dojocoding/hacienda-sdk` (ya existe) | `@quimera/factura-ci` (nuestra aportación) |
|---|---|---|
| Generación y validación XSD de XML FE 4.4 | **Sí** (`xmllint-wasm`, schemas, builders) | **Reutiliza** el validador del SDK sobre el XML que emite la SUT |
| Firma XAdES-EPES y verificación criptográfica | **Sí** (`signXml`, `verifySignedDocumentXml`) | **Reutiliza** para confirmar que la SUT firmó correctamente |
| Cálculo exacto de impuestos/totales y clave 50 dígitos | **Sí** (`BigInt`, calendario CR) | Verifica que la **app del desarrollador** no corrompe montos ni reutiliza claves |
| Concurrencia de consecutivos bajo tráfico simultáneo en la app | **No** (solo `sequences.json` local single-process) | **Sí (`FC-015..FC-018`)** — dispara ráfagas paralelas contra la SUT |
| Comportamiento ante timeout TCP tras `POST` | **Solo helper `classifySendResult`** | **Sí (`FC-029..FC-031`)** — corta la conexión TCP tras recibir el `POST` y verifica si la SUT comete doble emisión o reconcilia con `GET` |
| Idempotencia ante eventos duplicados de venta (`operationId`) | **No** (responsabilidad de la app según `production-integration.md`) | **Sí (`FC-009..FC-011`)** — reenvía eventos duplicados a la SUT y cuenta envíos recibidos |
| Aislamiento multi-contribuyente en la app | **No** | **Sí (`FC-020..FC-022`)** — verifica que la SUT no cruza tenants, tokens ni consecutivos |
| Durabilidad y recuperación tras reinicio de la app/worker | **No** | **Sí (`FC-023..FC-024`)** — reinicia la SUT con comprobantes `PENDIENTE` en vuelo |
| Correcciones legales (Nota de Crédito vs mutación de factura aceptada) | **Solo builder de NC** | **Sí (`FC-012..FC-014`)** — intenta mutar/reemitir una factura ya aceptada |

> **Aviso obligatorio en toda salida de Factura CI (`QR-FCI-008`):** *«Factura CI ejecuta pruebas conductuales sintéticas contra un simulador local determinista. Aprobar esta suite NO constituye certificación ni validación oficial del Ministerio de Hacienda de Costa Rica.»*

---

## 2. Catálogo de Escenarios Críticos de `Factura CI` (25 Escenarios MVP)

### Familia A — Integridad XML y Cálculos vía SDK (`FC-001`..`FC-004`)
| ID | Escenario | Fallo inyectado / Estímulo | Invariante verificada |
|---|---|---|---|
| `FC-001` | Emisión FE 4.4 estándar `CRC` | Venta simple con código CAByS e IVA 13% | XML recibido por simulador pasa `parseDocumentXml` + XSD 4.4 + totales exactos |
| `FC-002` | Emisión FE 4.4 en `USD` con tipo de cambio | Venta en dólares con 5 decimales | `CodigoMoneda = USD`, `TipoCambio` presente y sin deriva de punto flotante |
| `FC-003` | Emisión Tiquete Electrónico (`TE`) sin receptor obligatorio | Venta mostrador consumidor final | `doc_type = 04`, consecutivo independiente de `01` (`FE`) |
| `FC-004` | Validación de firma y clave 50 dígitos | Venta estándar | Clave cumple formato 50 dígitos y coincide exactamente con emisor/consecutivo/código seguridad |

### Familia B — Manejo de Estados Fiscales (`FC-005`..`FC-008`)
| ID | Escenario | Fallo inyectado / Estímulo | Invariante verificada |
|---|---|---|---|
| `FC-005` | Respuesta inicial `procesando` | Simulador responde `202` y luego `GET -> procesando` (2 veces) antes de `aceptado` | La SUT reporta `PENDIENTE`/`ENVIADO` mientras procesa y **nunca** marca `ACEPTADO` prematuramente |
| `FC-006` | Rechazo institucional (`rechazado`) | Simulador responde `GET -> rechazado` con `MensajeHacienda` | La SUT marca `RECHAZADO`, conserva el XML de respuesta y **no** reintenta el mismo XML automáticamente |
| `FC-007` | Distinción error técnico `503` vs `rechazado` | Simulador devuelve `503 Service Unavailable` | La SUT clasifica fallo técnico reintentable/pendiente y nunca lo registra como rechazo tributario |
| `FC-008` | Respuesta `409` / clave ya recibida | Simulador devuelve `409 Conflict` | La SUT consulta estado por `GET` para la clave original sin generar nueva factura |

### Familia C — Idempotencia Comercial y Correcciones (`FC-009`..`FC-014`)
| ID | Escenario | Fallo inyectado / Estímulo | Invariante verificada |
|---|---|---|---|
| `FC-009` | Evento de venta duplicado secuencial | Mismo `operationId` enviado 5 veces seguidas | Simulador recibe **exactamente 1** comprobante con 1 única clave |
| `FC-010` | Evento de venta duplicado simultáneo | Mismo `operationId` disparado en 10 peticiones concurrentes | Simulador recibe **exactamente 1** comprobante; 0 claves duplicadas |
| `FC-011` | Mutación de pedido tras encolar | Pedido cambia monto luego de emitir/encolar | El XML firmado enviado conserva el snapshot original inmutable |
| `FC-012` | Intento de editar/reemitir factura `ACEPTADO` | Solicitud de re-facturar o mutar misma `operationId` ya aceptada | SUT rechaza la mutación (`409`) y exige documento de referencia (Nota de Crédito) |
| `FC-013` | Emisión válida de Nota de Crédito (`NC`) | Corrección mediante `NC` (`purpose = 'credit_note'`) | `NC` incluye `InformacionReferencia` válida apuntando a la clave original aceptada |
| `FC-014` | Rechazo de reutilización de consecutivo tras `RECHAZADO` | Nueva emisión tras comprobante rechazado | SUT asigna un **nuevo** consecutivo estrictamente mayor; jamás recicla el consecutivo rechazado |

### Familia D — Concurrencia (`FC-015`..`FC-019`)
| ID | Escenario | Fallo inyectado / Estímulo | Invariante verificada |
|---|---|---|---|
| `FC-015` | Emisión concurrente de 10 ventas distintas | 10 ventas paralelas al mismo terminal | 10 consecutivos estrictamente distintos y monotónicos |
| `FC-016` | Emisión concurrente de tipos mezclados (`FE` y `TE`) | 10 `FE` + 10 `TE` simultáneos | Secuencias independientes por `doc_type`, sin colisiones |
| **`FC-017`** | **Ráfaga concurrente de reserva de consecutivo (Demo estrella)** | **20 solicitudes paralelas contra mismo emisor/sucursal/terminal** | **0 consecutivos repetidos y 0 claves colisionadas** (`demo-pos-buggy` falla aquí; `demo-pos-outbox` aprueba) |
| `FC-018` | Dos workers procesando la misma cola | 2 instancias de worker sobre 15 intenciones | Cada intención se envía exactamente 1 vez; 0 envíos duplicados al simulador |
| `FC-019` | Rate limit `429` bajo ráfaga | Simulador devuelve `429` con `Retry-After: 2` | SUT respeta backoff sin tormenta de reintentos ni pérdida de comprobantes |

### Familia E — Aislamiento Multi-Contribuyente (`FC-020`..`FC-022`)
| ID | Escenario | Fallo inyectado / Estímulo | Invariante verificada |
|---|---|---|---|
| `FC-020` | Emisión simultánea de `tenant-A` y `tenant-B` | Emisores distintos emitiendo en paralelo | Cada XML lleva emisor, consecutivo y credenciales exclusivas de su tenant |
| `FC-021` | Consulta cruzada de estado | `tenant-A` intenta consultar o reconciliar una clave de `tenant-B` | SUT rechaza con `403`/`404` sin filtrar metadatos ni XML |
| `FC-022` | Secuencia compartida por mismo `issuerId` | Dos operaciones sobre mismo emisor fiscal desde rutas distintas | Consecutivos particionados por `issuerId` nunca colisionan |

### Familia F — Recuperación y Estados Inciertos (`FC-023`, `FC-024`, `FC-031`)
| ID | Escenario | Fallo inyectado / Estímulo | Invariante verificada |
|---|---|---|---|
| `FC-023` | Caída antes del envío (`FIRMADO`) | Reinicio forzado de SUT tras persistir intención/firma antes de `POST` | Al reiniciar, SUT completa envío con la misma clave sin crear segunda intención |
| `FC-024` | Caída mientras Hacienda está `procesando` | Reinicio forzado de SUT con comprobante `PENDIENTE` | Al reiniciar, SUT retoma polling `GET` y cierra en `ACEPTADO` conservando acuse |
| **`FC-031`** | **Timeout TCP tras recibir `POST` (Demo estrella)** | **Simulador recibe y procesa el `POST`, luego cierra el socket sin responder HTTP** | **SUT marca estado incierto y reconcilia mediante `GET /{clave}` sin disparar jamás una segunda emisión ni nuevo consecutivo** (`demo-pos-buggy` falla aquí; `demo-pos-outbox` aprueba) |

---

## 3. Otros Escenarios de Fallo No Fiscales (Data Exodus y Pipeline)

| ID | Subsistema | Fallo inyectado | Comportamiento verificado |
|---|---|---|---|
| `FS-DATA-01` | `Data Exodus` | `SIGKILL` tras procesar 500 de 1.000 filas | Transacción parcial revierte; `resume` completa con conteos y hashes idénticos |
| `FS-DATA-02` | `Data Exodus` | Archivo fuente alterado en disco antes de `resume` | Aborta inmediatamente con `ERR_ARTIFACT_HASH_MISMATCH` |
| `FS-DATA-03` | `Data Exodus` | 1 byte corrupto en archivo dentro del CAS | `verify-artifacts` / lectura crítica falla con `ERR_ARTIFACT_INTEGRITY_FAILED` |
| `FS-PASS-01` | `CR API Passport` | Hacienda devuelve `429` o omite campo `impuesto` en CAByS | Circuit-breaker frena tráfico; `verify` reporta `ERR_PASSPORT_CONTRACT_DRIFT` |
| `FS-OFI-01` | `OficiOS` | Dos técnicos intentan transicionar misma orden simultáneamente | Bloqueo optimista (`version`) acepta 1 y rechaza el segundo con HTTP `409` |
