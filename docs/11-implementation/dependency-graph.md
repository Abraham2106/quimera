# Grafo de Dependencias (DAG de Desarrollo) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Validado contra `implementation-backlog.md`
- **Referencias:** [Backlog](./implementation-backlog.md) | [Plan MVP](./MVP-plan.md)

---

## 1. DAG de Implementación (Slices 1–7)

```mermaid
flowchart TD
    US001["US-001\nBootstrap Monorepo + PG 16"] --> US002["US-002\n@quimera/core (Zod + Puertos)"]
    US002 --> US003["US-003\nCAS Local SHA-256"]
    US002 --> US004["US-004\nDrizzle Schema qum_*"]

    %% Carril A: Data Exodus + Pipeline
    US003 --> US005["US-005\nImportador CSV"]
    US004 --> US005
    US003 --> US006["US-006\nImportador XLSX"]
    US004 --> US006
    US003 --> US007["US-007\nImportador XML FE 4.4"]
    US004 --> US007
    US005 --> US008["US-008\nIdempotencia + demo-hvac-1000"]
    US006 --> US008
    US007 --> US008
    US008 --> US009["US-009\nPerfilador + mapping.yaml"]
    US009 --> US010["US-010\nReconciliación (10 reglas)"]
    US010 --> US011["US-011\nDecisiones + trace"]
    US011 --> US012["US-012\nMigración PG + Reporte"]
    US004 --> US013["US-013\n@quimera/pipeline DAG"]
    US012 --> US013

    %% Carril B: CR API Passport (Paralelo)
    US002 --> US014["US-014\n3 Pasaportes CR + Fixtures"]
    US014 --> US015["US-015\nRate Limit + Cache + Auth"]
    US015 --> US016["US-016\nDrift Verify + CLI"]
    US016 -. "Should" .-> US017["US-017\nMCP stdio Passport"]

    %% Carril C: Fiscal Outbox + Factura CI (Paralelo)
    US002 --> US021["US-021\nPgDocumentStore + Secuencias"]
    US004 --> US021
    US021 --> US022["US-022\nWorker Outbox + Recovery"]
    US002 --> US023["US-023\nSimulador Loopback Factura CI"]
    US023 --> US024["US-024\n25 Escenarios + Reportes"]
    US022 --> US025["US-025\ndemo-pos buggy vs outbox"]
    US024 --> US025

    %% Convergencia: OficiOS + Integración Final
    US004 --> US018["US-018\nOficiOS FSM + hvac-v1"]
    US012 --> US018
    US016 --> US019["US-019\nAPI Hono OficiOS + RBAC"]
    US018 --> US019
    US019 --> US020["US-020\nUI Web Minimalista OficiOS"]

    US019 -. "Should" .-> US026["US-026\nOficiOS -> Fiscal Outbox"]
    US022 -. "Should" .-> US026

    US013 --> US027["US-027\nAislamiento + Seguridad + E2E"]
    US016 --> US027
    US020 --> US027
    US025 --> US027
    US026 -.-> US027
    US027 --> US028["US-028\ndemo:verify + README + Ejemplos"]
```

---

## 2. Análisis del Camino Crítico y Paralelismo

### Camino Crítico (Bloqueante para la Demo E2E)
`US-001` → `US-002` → `US-004` → `US-005/006/007` → `US-008` → `US-009` → `US-010` → `US-011` → `US-012` → `US-018` → `US-019` → `US-020` → `US-027` → `US-028`.

### Tres Carriles Paralelizables Inmediatamente Después de `US-002` (Core)
Si trabajan 2 a 4 personas (o ramas de trabajo independientes):
1. **Carril A (Datos & Pipeline):** `US-003..013` (`Data Exodus` + `Pipeline`).
2. **Carril B (APIs CR):** `US-014..017` (`CR API Passport`) — **cero dependencia de PostgreSQL**.
3. **Carril C (Fiscalidad):** `US-021..025` (`Fiscal Outbox` + `Factura CI` + `demo-pos`) — `US-023/024` tiene **cero dependencia de PostgreSQL**.

### Dependencias Externas y Mitigación de Bloqueos

| Dependencia externa | Dónde afecta | Mitigación para evitar bloqueos |
|---|---|---|
| `@dojocoding/hacienda-sdk@0.13.0` (npm) | `US-007`, `US-021`, `US-022`, `US-024` | Versión fijada en `pnpm-lock.yaml`; verificada en investigación directa |
| `api.hacienda.go.cr` / `apim.bccr.fi.cr` | `US-014`, `US-016` | Todo el desarrollo y pruebas corren contra `fixtures/passports-cr/` en `--mode fixture` (0 bloqueo por red o token) |
| Docker / PostgreSQL 16 local | `US-004` en adelante | `docker-compose.yml` con imagen oficial `postgres:16-alpine` y healthcheck |

### Puntos de Aprobación Humana / Revisión de Arquitectura antes de Avanzar
1. **Compuerta 1 (Fin de `US-002` y `US-004`):** Verificar congelación de contratos `@quimera/core` y DDL `qum_*` antes de abrir los 3 carriles en paralelo.
2. **Compuerta 2 (Fin de `US-012`):** Validar que el dataset `demo-hvac-1000` detecta exactamente `40+12+7+3+1` anomalías y migra limpiamente a `ofi_customers`/`ofi_equipment`.
3. **Compuerta 3 (Fin de `US-025`):** Validar la comparativa en vivo `demo-pos-buggy` vs `demo-pos-outbox` con `Factura CI`.
4. **Compuerta 4 (Pre-producción post-MVP):** Revisión de `QG-07` antes de habilitar certificados reales o entorno `production` de Hacienda.
