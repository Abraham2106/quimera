# Experiencia de Desarrollador (Developer Experience — DX) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [Diseño CLI](../06-interfaces/CLI-design.md) | [Diseño MCP](../06-interfaces/MCP-design.md) | [Personas STK-01..04](../02-product/stakeholders-and-personas.md)

---

## 1. Separación Estricta de Experiencias

QUIMERA atiende a dos audiencias fundamentalmente distintas que **nunca** deben compartir la misma interfaz ni el mismo lenguaje:
1. **Audiencia Técnica (DX):** Desarrolladores independientes (`STK-01`), vibe coders con agentes IA (`STK-02`), agencias (`STK-03`) e implementadores (`STK-04`). Necesitan paquetes instalables en segundos, contratos tipados, CLI determinista con `--json`, diagnósticos claros y pruebas locales sin red.
2. **Audiencia Empresarial (UX de OficiOS):** Técnicos y dueños de talleres (`STK-05`, `STK-06`). Necesitan lenguaje de oficio en español de Costa Rica, pasos guiados, fotos, aprobaciones simples y cero jerga de bases de datos, hashes o XML.

Este documento cubre la **Experiencia de Desarrollador (DX)**.

---

## 2. Flujo de Adopción en ≤ 5 Minutos (`QR-NFR-008`)

### 2.1. Uso Modular Independiente (sin clonar el monorepo)

```bash
# Caso A: Solo consultar y verificar APIs de Costa Rica
pnpm add @quimera/cr-api-passport
npx quimera-passport inspect cr.hacienda.cabys --json
npx quimera-passport verify --all --mode fixture

# Caso B: Solo probar tu app POS/ERP contra fallos fiscales
pnpm add -D @quimera/factura-ci
npx quimera-factura-ci run --target http://127.0.0.1:4010 --suite critical

# Caso C: Solo rescatar y migrar datos hacia PostgreSQL
pnpm add @quimera/data-exodus
npx quimera-exodus ingest --tenant mi-pyme --source clientes --input ./clientes.xlsx
```

### 2.2. Desarrollo Local Completo (Monorepo)

```bash
git clone <repo-url> && cd quimera
cp .env.example .env
docker compose up -d postgres     # PostgreSQL 16 en puerto 5432
pnpm install                      # Lockfile congelado, 0 binarios nativos
pnpm db:migrate                   # Migraciones Drizzle SQL
pnpm demo:verify                  # Ejecuta flujo completo offline + Factura CI
```

---

## 3. Primer Proyecto y Primer Pipeline

Un desarrollador o agente crea un archivo declarativo `pipeline.yaml` (ver `docs/06-interfaces/contracts/pipeline-exodus-oficios.yaml`):

```bash
# 1. Validar estáticamente grafo acíclico y compatibilidad de contratos
quimera pipeline validate ./pipeline.yaml

# 2. Correr en dry-run para previsualizar conflictos sin tocar tablas destino
quimera pipeline run ./pipeline.yaml --tenant taller-demo --dry-run

# 3. Correr real: si hay conflictos BLOCKING, el pipeline pausa con exit code 3
quimera pipeline run ./pipeline.yaml --tenant taller-demo
# -> Salida: "PAUSED (WAITING_FOR_APPROVAL): 43 conflictos bloqueantes abiertos.
#    Ejecute: quimera exodus conflicts list --tenant taller-demo --severity BLOCKING"

# 4. Resolver conflictos (o aplicar archivo de decisiones versionado en CI/demo)
quimera exodus conflicts resolve --conflict <id> --action MERGE --actor dev@empresa.cr --rationale "Confirmado por cédula"

# 5. Reanudar exactamente desde el checkpoint pausado
quimera pipeline resume --run <run_id>
```

---

## 4. Diseño de Errores y Diagnósticos

Todo error en terminal y SDK responde cuatro preguntas en 3 segundos: **qué falló (`code`)**, **dónde (`module` + `locator`)**, **si es seguro reintentar (`retryable`)** y **qué hacer ahora (`hint`)**:

```text
[ERR_MIGRATION_BLOCKED_BY_CONFLICTS] @quimera/data-exodus (retryable: false)
  No se puede migrar el lote "bat_01J..." hacia "oficios-v1@1.0.0":
  existen 4 conflictos de severidad BLOCKING en estado OPEN:
    - cnf_001 [CONFLICTING_IDENTITY] "Distribuidora Rodríguez" (cédulas 3101111111 vs 3101222222)
    - cnf_002 [UNRECONCILABLE_BALANCE] Saldo declarado ₡120.000 != movimientos ₡85.000
  Siguiente paso:
    quimera exodus conflicts list --batch bat_01J... --severity BLOCKING
```

---

## 5. Ergonomía Específica para Agentes de Programación (Claude Code / Cursor)

1. **Salida determinista `--json` en `stdout`:** Todos los logs informativos van estrictamente a `stderr` (`QR-NFR-007`), permitiendo que un agente ejecute `JSON.parse(stdout)` sin fallos.
2. **Exit codes semánticos (`0/1/2/3/4/5`):** El agente distingue un error de código (`1`) de una pausa que requiere preguntarle al humano (`3`) o de un secreto faltante (`4`).
3. **Descriptores de capacidades (`--capabilities --json`):** Permite al agente descubrir sin leer código fuente qué módulos, pasos y pasaportes existen.
4. **Distribución vía Dojo Marketplace (`DojoCodingLabs/dojo-marketplace-mcp`):** Publicación post-MVP de un paquete skill/plugin liviano que enseña al agente cuándo invocar `CR API Passport` y `Factura CI`, sin acoplar el runtime de QUIMERA al marketplace.
5. **Testing local sin red:** Flags `--mode fixture` y simulador loopback de `Factura CI` aseguran que el agente puede iterar en ciclos rápidos *edit → test → fix* en < 10 segundos.

---

## 6. Documentación y Ejemplos Incluidos al Construir el MVP

- `README.md` raíz con guía de 5 minutos y diagrama del ecosistema.
- `examples/01-passport-cabys/` — Consulta y detección de deriva en 20 líneas de TypeScript.
- `examples/02-exodus-demo-1000/` — Migración completa del dataset sintético de 7 archivos.
- `examples/03-factura-ci-pos/` — Comparativa `demo-pos-buggy` vs `demo-pos-outbox`.
- `examples/04-pipeline-oficios/` — Flujo E2E completo `Data Exodus → OficiOS`.
