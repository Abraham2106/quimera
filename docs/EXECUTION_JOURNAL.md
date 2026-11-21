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

## 2026-11-21 — Oleada de cierre (tres subagentes `composer-2.5`)

- [Detect real HVAC fixtures](bc-303a4f27-d6b8-5e80-a586-10f1e4ad7d2d): `loadDemoHvac1000` sobre `fixtures/demo-hvac-1000`, conteos 40/12/7/3/1, migración bloqueada y procedencia. Write scope: `packages/data-exodus`.
- [Factura CI demo-pos exits](bc-210ec4db-5da1-59b3-9231-589bdf9a712a): CLI `demo-pos` con exit 1 (buggy, FC-017 y FC-031) y exit 0 (outbox, 25/25). Write scope: `apps/demo-pos`.
- [OficiOS minimal Spanish UI](bc-f5800cc1-88c3-5dbd-a1b9-fcc35a20dc5e): React + Vite + Tailwind en `apps/oficios/web`. Write scope: UI de OficiOS y su `package.json`.

## 2026-11-21 — Compuerta de los cinco criterios

- `loadDemoHvac1000` sobre los archivos de `fixtures/demo-hvac-1000` deja 40/12/7/3/1. La migración desde esos archivos bloquea, aplica decisiones y deja procedencia.
- El pipeline de ese dataset sale con código 3 y, tras la decisión, reanuda con código 0 (`t-pipe-hvac-gate`).
- CLI de `demo-pos`: buggy exit 1 con FC-017 y FC-031; outbox exit 0 y 25/25.
- OficiOS: HTTP 409, un `FiscalIntent`, CAByS en modo fixture del pasaporte, UI en `apps/oficios/web` (Vite en `127.0.0.1:5173`).
- `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test` 55 archivos / 128 pruebas, `pnpm test:isolation` 0, `pnpm test:security` 17/17, `QUIMERA_AI_ENABLED=false pnpm demo:verify` 0.
- `pnpm audit --audit-level=high` sigue en rojo por `tinypool` y `drizzle-orm`. Sin override. Post-MVP no se inició.
