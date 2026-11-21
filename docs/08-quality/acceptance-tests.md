# Pruebas de Aceptación End-to-End (`AT-01`..`AT-18`) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Listo para implementación
- **Referencias:** [Casos de Uso UC-01..UC-18](../02-product/use-cases.md) | [Matriz de Trazabilidad](../09-traceability/requirements-traceability-matrix.md)

---

## Convención de Criterios Observables

Cada prueba de aceptación (`AT-xx`) corresponde 1:1 a su caso de uso (`UC-xx`) y se formula en formato **Dado / Cuando / Entonces** con salidas observables verificables por CLI, API o consulta SQL.

---

### `AT-01` — Importar archivo CSV (`UC-01`)
- **Dado** un tenant activo y `ventas_2025.csv` (delimitador `;`, Latin-1, tildes y 2 filas deliberadamente malformadas).
- **Cuando** se ejecuta `quimera exodus ingest --tenant demo --source ventas_csv --input ventas_2025.csv --json`.
- **Entonces** el código de salida es `0`, el archivo existe en CAS con su `SHA-256` exacto, los acentos se preservan íntegros y `total_rows_seen == parsed_ok + parse_errors + skipped_empty` (con las 2 filas malformadas registradas en `qum_raw_records` con `parse_status = 'ERROR'`).

### `AT-02` — Importar libro XLSX (`UC-02`)
- **Dado** `clientes.xlsx` con 2 hojas, fechas seriales de Excel y una celda con fórmula sin valor cacheado.
- **Cuando** se ejecuta `quimera exodus ingest --tenant demo --source clientes_xlsx --input clientes.xlsx --json`.
- **Entonces** todas las filas no vacías de ambas hojas quedan en `qum_raw_records` con `source_locator = "xlsx:<hoja>!row:<n>"`, las fechas se convierten a ISO-8601 y se emite `WARN_XLSX_UNCACHED_FORMULA` sin ejecutar macros.

### `AT-03` — Interpretar comprobantes XML FE 4.4 (`UC-03`)
- **Dado** un directorio con 12 XML `FE 4.4`, 2 XML `FE 4.3` y 1 XML malicioso con `<!DOCTYPE>` (XXE).
- **Cuando** se ejecuta `quimera exodus ingest --tenant demo --source facturas_xml --input ./xml/*.xml --format fe_xml --json`.
- **Entonces** los 12 FE 4.4 extraen clave de 50 dígitos, CAByS y totales exactos mediante `hacienda-sdk`; los 2 FE 4.3 emiten `WARN_XML_LEGACY_V43` sin descartarse; el XML con `DOCTYPE` es rechazado con `ERR_SEC_XXE_REJECTED`.

### `AT-04` — Perfilado estructural (`UC-04`)
- **Dado** los lotes completados de `demo-hvac-1000`.
- **Cuando** se ejecuta `quimera exodus profile --batch <id> --json`.
- **Entonces** el reporte identifica columnas de cédula CR, montos con símbolos mixtos (`₡`/`$`), formatos de fecha y tasa de nulos sin invocar ningún modelo de IA.

### `AT-05` — Propuesta de correspondencias (`UC-05`)
- **Dado** un `SchemaProfile` y el esquema destino `oficios-v1@1.0.0`.
- **Cuando** se ejecuta `quimera exodus map propose --project <id> --target oficios-v1`.
- **Entonces** se genera `mapping.yaml` editable con puntajes de confianza, justificación por regla y marcado `NEEDS_REVIEW` para columnas ambiguas, sin modificar tablas destino.

### `AT-06` — Detección de duplicados y contradicciones (`UC-06`)
- **Dado** `demo-hvac-1000` (1.000 registros con 40 clientes repetidos, 12 facturas duplicadas, 7 pagos mal atribuidos, 3 cédulas contradictorias y 1 saldo irreconciliable).
- **Cuando** se ejecuta `quimera exodus reconcile --project <id> --json`.
- **Entonces** el sistema detecta el 100% de las anomalías sembradas, crea `Conflict(status='OPEN')` para cada ambigüedad o contradicción y **no fusiona automáticamente** ningún par de clientes con nombre similar sin cédula idéntica.

### `AT-07` — Registro auditable de decisiones humanas (`UC-07`)
- **Dado** conflictos `OPEN` de `AT-06`.
- **Cuando** un operador resuelve un duplicado probable (`MERGE`) y marca el saldo irreconciliable (`MARK_UNRECONCILABLE` con motivo), y luego intenta sobrescribir la decisión directamente.
- **Entonces** las decisiones quedan en `qum_decisions` con `actor_id`, `rationale` y timestamp; el intento de edición directa falla (`ERR_CONFLICT_ALREADY_RESOLVED`) y solo se permite enmienda vía `supersedes_decision_id`.

### `AT-08` — Idempotencia de importación repetida (`UC-08`)
- **Dado** que `ventas_2025.csv` ya fue ingerido exitosamente en el tenant `demo`.
- **Cuando** se vuelve a ejecutar exactamente el mismo comando `quimera exodus ingest`.
- **Entonces** el resultado reporta `inserted: 0`, el conteo de filas en `qum_raw_records` no cambia y las decisiones humanas previas permanecen intactas.

### `AT-09` — Recuperación tras interrupción (`UC-09`)
- **Dado** una corrida de importación/pipeline interrumpida forzadamente (`SIGKILL`) al 50%.
- **Cuando** se ejecuta `quimera pipeline resume --run <run_id>`.
- **Entonces** el motor valida el `SHA-256` del artefacto original, no reprocesa pasos confirmados y el estado final en PostgreSQL es bit-a-bit idéntico a una corrida ininterrumpida.

### `AT-10` — Migración hacia PostgreSQL y procedencia (`UC-10`)
- **Dado** un proyecto reconciliado (primero con 1 conflicto `BLOCKING` abierto, luego resuelto).
- **Cuando** se ejecuta `migrate --dry-run`, luego `migrate` con conflicto abierto y finalmente `migrate` tras resolverlo.
- **Entonces** `--dry-run` deja 0 filas; el intento con conflicto abierto falla con `ERR_MIGRATION_BLOCKED_BY_CONFLICTS`; la corrida final carga PostgreSQL, emite `ReconciliationReport` cuadrado y `quimera exodus trace --entity <id>` devuelve archivo origen, fila y decisión.

### `AT-11` — Consulta y detección de deriva en `CR API Passport` (`UC-11`)
- **Dado** los 3 pasaportes MVP (`taxpayer`, `cabys`, `fx/bccr-sdde`).
- **Cuando** se ejecuta `passport query` (2 veces seguidas), `passport verify` contra un fixture mutado y consulta a `cr.bccr.sdde` sin `BCCR_SDDE_TOKEN`.
- **Entonces** la segunda consulta retorna `fromCache: true`; el fixture mutado falla con `ERR_PASSPORT_CONTRACT_DRIFT` señalando el campo alterado; y BCCR sin token falla inmediatamente con `ERR_AUTH_MISSING_CREDENTIALS`.

### `AT-12` — Ejecución de pipeline declarativo (`UC-12`)
- **Dado** `pipeline-exodus-oficios.yaml` válido y un manifiesto inválido con ciclo o contrato `2.0.0 -> 1.0.0`.
- **Cuando** se validan y ejecutan ambos manifiestos.
- **Entonces** el inválido es rechazado antes del paso 1; el válido corre con checkpoints, se pausa con exit code `3` en `human_review` si hay conflictos bloqueantes y concluye en `COMPLETED` al reanudar.

### `AT-13` — Uso independiente de módulos (`UC-13`)
- **Dado** un proyecto Node 22 vacío externo al monorepo.
- **Cuando** se instala únicamente `@quimera/cr-api-passport` (o `@quimera/data-exodus` o `@quimera/factura-ci`).
- **Entonces** no se instalan ni `apps/oficios` ni `@quimera/adapter-clairic` y las pruebas de humo del paquete pasan con exit code `0`.

### `AT-14` — Ciclo completo de orden en OficiOS (`UC-14`)
- **Dado** clientes y equipos migrados por `Data Exodus` en PostgreSQL.
- **Cuando** un operador crea una orden HVAC, registra diagnóstico + foto (`sha256`), presupuesta materiales con CAByS, registra aprobación del cliente, interviene, verifica y cierra la orden.
- **Entonces** la ficha del cliente muestra su procedencia desde `Data Exodus`, la orden transita a `CLOSED` con historial completo y se encola exactamente 1 `FiscalIntent` en `Fiscal Outbox`.

### `AT-15` — Rechazo de transición inválida en OficiOS (`UC-15`)
- **Dado** una orden en estado `QUOTED` sin aprobación registrada del cliente.
- **Cuando** se solicita pasarla a `IN_PROGRESS` o `CLOSED`.
- **Entonces** la API retorna HTTP `409 Conflict` (`ERR_WORK_ORDER_APPROVAL_REQUIRED`), el estado permanece `QUOTED` y no se genera intención fiscal.

### `AT-16` — Ejecución comparativa de `Factura CI` (`UC-16`)
- **Dado** `apps/demo-pos` en modo defectuoso (`demo-pos-buggy`) y en modo protegido con `Fiscal Outbox` (`demo-pos-outbox`).
- **Cuando** se ejecuta `quimera factura-ci run` contra ambos targets.
- **Entonces** sobre `demo-pos-buggy` retorna exit code `1` detectando explícitamente `FC-017` (concurrencia de consecutivo) y `FC-031` (doble emisión tras timeout); sobre `demo-pos-outbox` retorna exit code `0` (100% aprobado) con reporte JSON + disclaimer sintético.

### `AT-17` — Operación baseline sin Clairic (`UC-17`)
- **Dado** entorno sin `@quimera/adapter-clairic`, sin GPU y sin red externa (`QUIMERA_AI_ENABLED=false`).
- **Cuando** se ejecuta el flujo completo `Data Exodus -> Pipeline -> OficiOS -> Fiscal Outbox -> Factura CI`.
- **Entonces** el 100% de los pasos concluyen con exit code `0` y `0` solicitudes a servicios de inferencia.

### `AT-18` — Conexión opcional de Clairic (`UC-18`, Post-MVP / Stub en MVP)
- **Dado** `@quimera/adapter-clairic` conectado a un stub determinista que devuelve `confidence = 0.72` y un documento con payload de prompt injection.
- **Cuando** se invoca `StructuredExtractorPort.extract()`.
- **Entonces** los valores quedan marcados `origin_kind = 'AI_EXTRACTION'` con `confidence`, `pNull` y spans, se crea automáticamente `Conflict(AI_LOW_CONFIDENCE, OPEN)` y la instrucción inyectada no produce ningún efecto secundario.
