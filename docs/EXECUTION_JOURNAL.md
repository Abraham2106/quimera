# Diario de ejecución — QUIMERA

- **Versión:** 1.0.0
- **Inicio:** 2026-11-21
- **Rol:** Agente jefe autónomo (subagentes `composer-2.5`)

## 2026-11-21 — Oleada 0

- Entorno: Node `v22.23.4`, pnpm `10.33.4`. Docker no está disponible en la VM.
- Decisión autónoma: PostgreSQL 16 se instalará como servicio local del sistema (Ubuntu 24.04) además de dejar `docker-compose.yml` para entornos con Docker. `DATABASE_URL=postgres://quimera:quimera@127.0.0.1:5432/quimera`.
- `WBS-1.1` (`US-001`) despachado a subagente `composer-2.5`. Verificación del jefe: `pnpm typecheck`, `pnpm lint` y `pnpm test` salieron con código 0. `@dojocoding/hacienda-sdk@0.13.0` se instaló desde npm.
- `WBS-1.2` verificado por el jefe: typecheck, eslint y vitest de `@quimera/core` salieron 0 (17 pruebas, incluye fast-check). Siguiente: Oleada 1 en paralelo (`WBS-1.3` CAS y `WBS-1.4` DDL).
- Hallazgo de runtime (no contradice el diseño, ajusta el import): `@dojocoding/hacienda-sdk@0.13.0` publicado en npm **solo exporta el entry `.`**. `parseDocumentXml`, `DocumentStore`, `FileDocumentStore`, `VALID_TRANSITIONS`, `classifySendResult`, `evaluateDeadline`, `lookupTaxpayer` y `verifySignedDocumentXml` salen de `@dojocoding/hacienda-sdk`, no de un subpath `./delivery` (ese subpath no está en `exports`). Los paquetes posteriores deben importar desde la raíz del paquete.

## 2026-11-21 — Barrera de verificación (SYNC-4 parcial)

- `scripts/demo-verify.mjs` y el script `pnpm demo:verify` ejecutan, con `QUIMERA_AI_ENABLED=false`, el manifiesto `fixtures/demo-hvac-1000/ANOMALIES.json` (40/12/7/3/1), la prueba de migración, el DAG del pipeline, OficiOS (409 e intent único) y Factura CI (25/25 más FC-017 y FC-031). Exit code 0.
- `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test` 121/121, `pnpm test:isolation` 0, `pnpm test:security` 17/17.
- ESLint: se quitaron imports sin uso y los scripts `.mjs` declaran `process` y `console`.
- `pnpm audit --audit-level=high` exit 1: `tinypool` vía Vitest y `drizzle-orm` &lt; 0.45.2. Sin override para no mover dependencias ya verdes.
- Sigue abierto: UI OficiOS, detección de anomalías leyendo las 1.000 filas de disco, y exit codes del CLI de Factura CI contra un proceso `demo-pos`.
