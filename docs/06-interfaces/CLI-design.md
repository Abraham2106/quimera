# Diseño de Interfaz de Línea de Comandos (CLI) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [DX](../10-experience/developer-experience.md) | [Contratos Públicos](./public-contracts.md) | [SRS QR-NFR-006](../03-requirements/SRS.md)

---

## 1. Principios de Diseño CLI

1. **Ergonómica para humanos y determinista para agentes IA:** Todo comando soporta `--json` para salida estructurada estricta en `stdout` (logs diagnósticos únicamente en `stderr`).
2. **Modularidad instalable:** Existen binarios independientes por paquete (`quimera-exodus`, `quimera-passport`, `quimera-factura-ci`, `quimera-pipeline`) y un meta-comando opcional `quimera <subcomando>` cuando se instala el toolkit completo.
3. **Sin sorpresas destructivas:** Las escrituras en base de datos destino soportan `--dry-run`; las operaciones con secretos leen exclusivamente desde variables de entorno o archivos con permisos `0600` (nunca pasar contraseñas o tokens en flags de línea de comandos para evitar exposición en `ps`/historial).

---

## 2. Convención Estándar de Códigos de Salida (Exit Codes)

| Código | Significado | Uso por CI y Agentes |
|---|---|---|
| `0` | Éxito completo | Continuar flujo |
| `1` | Error operacional o de validación / pruebas fallidas (`Factura CI`) | Bloquear merge o reportar error |
| `2` | Error de uso / argumentos o manifiesto inválido | Corregir invocación |
| `3` | **Pausa intencional (`WAITING_FOR_APPROVAL`)** — existen conflictos `BLOCKING` abiertos | Presentar conflictos a revisión humana y luego ejecutar `resume` |
| `4` | Credenciales faltantes o rechazadas (`ERR_AUTH_MISSING_CREDENTIALS`) | Configurar secreto antes de reintentar |
| `5` | Deriva de contrato detectada (`ERR_PASSPORT_CONTRACT_DRIFT`) | Actualizar pasaporte o investigar API externa |

---

## 3. Catálogo de Comandos

### 3.1. `data-exodus` (`quimera exodus ...`)

```bash
# Ingerir archivos en CAS + qum_raw_records (idempotente)
quimera exodus ingest --tenant <slug> --source <name> --input <path...> [--format auto|csv|xlsx|fe_xml] [--json]

# Perfilar lote y generar propuesta de esquema + mapping.yaml
quimera exodus profile --batch <batch_id> --out mapping.yaml [--json]

# Normalizar y detectar conflictos (sin escribir en tablas destino)
quimera exodus reconcile --batch <batch_id> --mapping mapping.yaml [--json]

# Listar conflictos abiertos o filtrados por severidad
quimera exodus conflicts list --tenant <slug> [--severity BLOCKING] [--status OPEN] [--json]

# Registrar decisión humana auditable sobre un conflicto
quimera exodus conflicts resolve --conflict <conflict_id> \
  --action MERGE|KEEP_SEPARATE|OVERRIDE_FIELD|REJECT_RECORD|MARK_UNRECONCILABLE \
  --actor <email_or_id> --rationale "<explicación>" [--payload '{"winnerId":"..."}'] [--json]

# Migrar entidades verificadas a PostgreSQL destino
quimera exodus migrate --batch <batch_id> --target oficios-v1 [--dry-run] [--allow-partial-quarantine] [--json]

# Consultar árbol completo de procedencia de una entidad o campo
quimera exodus trace --entity <entity_id> [--field balance_due_minor] [--json]
```

### 3.2. `cr-api-passport` (`quimera passport ...`)

```bash
# Listar pasaportes disponibles y sus requisitos de auth
quimera passport list [--json]

# Inspeccionar contrato, endpoints, límites y políticas de un pasaporte
quimera passport inspect cr.hacienda.cabys [--json]

# Consultar un servicio aplicando rate-limit, validación Zod y caché
quimera passport query cr.hacienda.cabys --param q=aire --mode mock|live [--json]
quimera passport query cr.hacienda.taxpayer --param identificacion=3101123456 --mode live [--json]

# Verificar contrato y detectar deriva (mock en CI o live bajo demanda)
quimera passport verify [cr.hacienda.cabys|--all] --mode mock|live [--json]

# Generar adaptador TypeScript tipado + suite Vitest de contrato
quimera passport generate cr.hacienda.cabys --out ./src/adapters/hacienda-cabys [--json]
```

### 3.3. `factura-ci` (`quimera factura-ci ...`)

```bash
# Ejecutar suite completa o filtrada contra SUT (endpoint HTTP o comando local)
quimera factura-ci run --target http://127.0.0.1:4010 \
  [--suite all|concurrency|recovery|isolation|states|xml] \
  [--seed 20261121] \
  [--format pretty|json|junit] \
  [--out report.json]

# Listar escenarios disponibles (FC-001..FC-024 + FC-031)
quimera factura-ci list [--json]
```

### 3.4. `pipeline` (`quimera pipeline ...`)

```bash
# Validar estáticamente DAG, aciclicidad y compatibilidad SemVer de contratos
quimera pipeline validate ./pipelines/exodus-to-oficios.yaml [--json]

# Ejecutar pipeline con checkpoints en PostgreSQL
quimera pipeline run ./pipelines/exodus-to-oficios.yaml --tenant <slug> [--dry-run] [--json]

# Reanudar ejecución pausada (WAITING_FOR_APPROVAL) o fallida tras crash
quimera pipeline resume --run <run_id> [--json]

# Consultar estado de ejecución y checkpoints
quimera pipeline status --run <run_id> [--json]
```

### 3.5. `fiscal-outbox` (`quimera outbox ...`)

```bash
# Inspeccionar intenciones y documentos fiscales por estado (ej. INCIERTO, PENDIENTE)
quimera outbox status --tenant <slug> [--state INCIERTO|PENDIENTE|RECHAZADO] [--json]

# Ejecutar reconciliación manual segura sobre documentos en estado INCIERTO (consulta GET por clave, jamás reenvío POST ciego)
quimera outbox reconcile --tenant <slug> --clave <50_digitos> [--json]
```
