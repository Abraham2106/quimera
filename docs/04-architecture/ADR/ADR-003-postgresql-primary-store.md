# ADR-003: PostgreSQL 16+ como Almacén Principal

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-DATA-011`, `QR-DATA-013`, `QR-OUT-002`, `QR-OUT-003`, `QR-OUT-004`, `QR-SEC-001`

## Contexto
QUIMERA necesita persistencia ACID para: registros crudos (`JSONB`), procedencia auditable, conflictos y decisiones humanas, entidades operativas migradas, consecutivos fiscales atómicos bajo concurrencia, outbox transaccional multi-worker y checkpoints de pipeline.

## Problema
Decidir si usar una única base relacional consolidada (PostgreSQL) o bases especializadas distintas (ej. SQLite local + Redis + MongoDB + ClickHouse).

## Alternativas evaluadas
1. **PostgreSQL 16+ (con Drizzle ORM + migraciones SQL)** como único almacén transaccional principal (Docker local / gestionado en prod).
2. **SQLite** para local/CLI + **PostgreSQL** en producción.
3. **Políglota** (MongoDB para crudos + PostgreSQL para finanzas + Redis para colas).

## Criterios de decisión
Garantías ACID bajo concurrencia real, soporte de `JSONB`, `NUMERIC` exacto, `pg_trgm`, `FOR UPDATE SKIP LOCKED`, `Row-Level Security (RLS)`, compatibilidad con Supabase/Neon y baja carga operativa.

## Evidencia relevante
- `hacienda-cr/docs/production-integration.md` advierte explícitamente que locks de archivo local no coordinan procesos ni contenedores efímeros y recomienda transacciones atómicas en BD.
- SQLite no soporta `SELECT ... FOR UPDATE SKIP LOCKED`, RLS ni concurrencia real multi-escritor, lo que invalidaría pruebas realistas de `Fiscal Outbox` y `Factura CI`.
- PostgreSQL cubre simultáneamente datos semiestructurados (`JSONB`), integridad relacional, búsquedas difusas (`pg_trgm`), colas durables (`SKIP LOCKED`) y aislamiento (`RLS`).

## Decisión
Establecer **PostgreSQL 16+** como almacén principal único para `Data Exodus`, `Fiscal Outbox`, `Pipeline` (checkpoints) y `OficiOS`, accedido mediante **Drizzle ORM** con migraciones SQL versionadas. Los puertos de repositorio siguen permitiendo adaptadores *in-memory* exclusivamente para pruebas unitarias rápidas.

## Consecuencias
- **Positivas:** Una sola pieza de infraestructura que cubrir con backups/transacciones; compatibilidad directa con Supabase/Neon; pruebas de concurrencia reales.
- **Negativas:** Requiere PostgreSQL disponible (ej. `docker compose up -d postgres`) para ejecutar migraciones y pruebas de integración.

## Riesgos
- **Riesgo:** Fricción si un desarrollador no tiene Docker instalado.
- **Mitigación:** Documentar conexión a cualquier PostgreSQL estándar (local nativo, Docker, Neon o Supabase free tier) mediante `DATABASE_URL`; `CR API Passport` y `Factura CI` no requieren PostgreSQL propio.

## Condiciones de revisión
Si la telemetría de producción mostrara contención de cola en `Fiscal Outbox` (>500 comprobantes/segundo sostenidos), evaluar un broker dedicado detrás de `OutboxSchedulerPort`.
