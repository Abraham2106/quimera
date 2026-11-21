# Confiabilidad, Tolerancia a Fallos y Recuperación — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP y Producción
- **Referencias:** [Arquitectura de Pipelines](../04-architecture/pipeline-architecture.md) | [Arquitectura de Despliegue](../04-architecture/deployment-architecture.md) | [Escenarios de Fallo](../08-quality/failure-scenarios.md)

---

## 1. Principios de Confiabilidad

1. **Honestidad sobre garantías distribuidas:** QUIMERA opera bajo semántica **`at-least-once` + idempotencia explícita**. No se promete *exactly-once* mágico sobre redes no confiables (`ADR-008`, `ADR-013`).
2. **Fallar cerrado ante incertidumbre fiscal:** Cuando una llamada a Hacienda sufre timeout o corte de red, el estado pasa a `INCIERTO` y **nunca** se reenvía un `POST` automático sin reconciliar primero por `GET /recepcion/{clave}`.
3. **Recuperación verificable:** Todo proceso largo (`Data Exodus`, `Pipeline`, `Fiscal Outbox`) persiste su estado en PostgreSQL antes y después de efectos externos, de modo que un reinicio del proceso (`SIGKILL`) no pierde ni duplica trabajo.

---

## 2. Objetivos de Confiabilidad (Hipótesis Medibles para Producción)

| Dimensión | MVP (Hackathon / Local) | Producción PYME `[HIPÓTESIS — pendiente de validación]` |
|---|---|---|
| **RPO (Recovery Point Objective)** | 0 en transacciones confirmadas (PostgreSQL local + CAS en disco) | **≤ 5 minutos** mediante archivado continuo WAL (PITR) + replicación síncrona/inmediata de artefactos en S3/R2 |
| **RTO (Recovery Time Objective)** | ≤ 5 minutos (levantar Docker Compose + reanudar checkpoint) | **≤ 30 minutos** restaurando instancia PostgreSQL gestionada + redepliegue de contenedor stateless |
| **Integridad de datos migrados** | 0 registros perdidos silenciosamente (`ERR_DATA_COUNT_MISMATCH`) | Igual (invariante absoluta) |
| **Integridad fiscal** | 0 consecutivos duplicados y 0 reenvíos ciegos tras timeout (`Factura CI` 100% verde) | Igual (invariante absoluta) |
| **Disponibilidad API `OficiOS`** | Local estable para demo | **99.5%** horario laboral CR (tolerando caídas de Hacienda gracias a `Fiscal Outbox` desacoplado) |

---

## 3. Mecanismos de Recuperación por Subsistema

### 3.1. `Data Exodus` y `@quimera/pipeline`
- **Fallo durante ingestión (`ingest`):** Transacción PostgreSQL hace `ROLLBACK`; archivos ya escritos en CAS son content-addressed (idempotentes). Al reintentar, `idempotency_key` asegura re-ingestión limpia sin duplicar filas.
- **Fallo durante reconciliación o carga (`migrate`):** El `Checkpoint` del paso fallido queda en estado `FAILED` con `attempt_count` y `error_json`. Tras corregir el entorno o la causa, `quimera pipeline resume --run <id>` salta todos los pasos con `status = COMPLETED` y reanuda exactamente desde el paso pendiente.
- **Reversión de carga destino:** Si el paso `exodus.migrate` requiere deshacerse antes de operación productiva, ejecuta la compensación declarada `exodus.rollback_target_batch` filtrada estrictamente por `import_batch_id`.

### 3.2. `Fiscal Outbox`
- **Caída del worker con lease tomado:** Cada worker adquiere documentos con `SELECT ... FOR UPDATE SKIP LOCKED` y actualiza `lease_owner` + `lease_expires_at = now() + interval '60 seconds'`. Si el worker muere (`SIGKILL`), transcurridos 60s otro worker reclama automáticamente el documento sin pérdida.
- **Caída después de `POST` a Hacienda antes de confirmar respuesta:**
  1. Antes de invocar `POST`, el worker persiste `delivery_state = 'PENDIENTE'` y el `signed_xml_artifact_id` en PostgreSQL.
  2. Si el proceso cae o la red hace timeout durante `POST`, el estado en BD queda en `PENDIENTE`/`INCIERTO`.
  3. Al recuperarse, el worker **NO vuelve a invocar `POST`**: ejecuta `GET` de estado por `clave` usando `hacienda-sdk`:
     - Si Hacienda responde `aceptado` o `rechazado`, guarda el `MensajeHacienda` en CAS y transiciona a `ACEPTADO`/`RECHAZADO`.
     - Si Hacienda responde `404` tras ventana de gracia documentada, registra evidencia y escala a revisión (`REQUIRES_REVIEW`) o contingencia controlada según política del emisor (ver `hacienda-cr/docs/production-integration.md`).
- **Desacoplamiento comercial vs fiscal:** Si los servidores de Hacienda están caídos durante 2 horas, `OficiOS` sigue cerrando órdenes de trabajo y cobrando normalmente; `Fiscal Outbox` mantiene las intenciones en cola durable y completa la emisión al restablecerse Hacienda.

### 3.3. `CR API Passport`
- **Protección contra ban IP de 10 minutos (`api.hacienda.go.cr`):**
  - Token bucket conservador (`15 req/s` ráfaga, `8 req/s` sostenido) compartido por host.
  - Circuit breaker inmediato de ≥ 60s si llega cualquier HTTP `429`.
- **Degradación elegante ante caída externa:**
  - En endpoints con `allowStaleOnUpstreamError: true` (ej. catálogo CAByS o TC del día anterior), el adaptador puede retornar valor en caché expirada únicamente si el consumidor pasa `allowStale: true`, devolviendo siempre la advertencia explícita `W_PASS_STALE_CACHE` con `cachedAt`.

---

## 4. Procedimiento de Respaldo y Verificación (Producción)

1. **PostgreSQL:** Snapshot base diario + WAL archiving continuo (retención 30 días); backups cifrados en región distinta.
2. **CAS (`qum_artifacts`):** Replicación en bucket S3/R2 con versionado y Object Lock para `fe_xml_signed` y `hacienda_response` (retención ≥ 5 años).
3. **Verificación de salud:** Job programado semanal ejecuta `quimera verify-artifacts` (recalcula `SHA-256` sobre muestra/total) y simulacro trimestral de restauración completa en base efímera verificando conteos de `qum_entities` y `fob_fiscal_documents`.
