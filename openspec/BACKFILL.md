# Backfill de OpenSpec — 2026-11-21

## Alcance y fuentes verificadas

Este backfill inicializa `openspec/specs/` a partir del baseline MVP verificado en `main` tras los PRs #1, #2 y #3 (`pnpm verify` en verde: 69 archivos de pruebas, 160 pruebas unitarias/integración, 17 pruebas de seguridad, `pnpm test:isolation` y `QUIMERA_AI_ENABLED=false pnpm demo:verify`).

Cada capacidad se redactó contrastando directamente el código fuente y las pruebas reales del monorepo, sin trasladar a `openspec/specs/` aspiraciones de producción todavía no implementadas:

- `core-contracts-money`: `packages/core/src/*` y `packages/core/src/t-core-*.test.ts`.
- `exodus-profiling-mapping`: `packages/data-exodus/src/profile/*` y `packages/data-exodus/tests/profile/t-data-004-005.test.ts`.
- `exodus-ingestion-provenance`: `packages/data-exodus/src/importers/*`, `packages/data-exodus/src/demo/persist-oficios.ts` y `packages/data-exodus/tests/db/postgres-qum.integration.test.ts`.
- `exodus-reconciliation-decisions`: `packages/data-exodus/src/decisions/*`, `packages/data-exodus/src/migrate/*` y `packages/data-exodus/tests/migrate/t-data-012.test.ts`.
- `pipeline-dag-checkpoints`: `packages/pipeline/src/*` y `scripts/quimera.mjs`.
- `passport-registry-client`: `packages/cr-api-passport/src/*` y `packages/cr-api-passport/passports/*.yaml`.
- `passport-mcp-server`: `packages/cr-api-passport/src/mcp/server.ts` y `packages/cr-api-passport/tests/mcp/t-pass-007.test.ts`.
- `fiscal-outbox-sequences`: `packages/fiscal-outbox/src/*`.
- `factura-ci-harness`: `packages/factura-ci/src/*` y `apps/demo-pos/src/*`.
- `oficios-workshop-flow`: `apps/oficios/src/*`, `apps/oficios/drizzle/*` y `apps/oficios/web/*`.
- `clairic-optional-isolation`: `packages/adapter-clairic/src/*` y `scripts/test-isolation.mjs`.

## Límites explícitos dejados fuera de `openspec/specs/`

Para evitar falsas afirmaciones de cumplimiento, los siguientes requisitos documentados en `docs/` para producción **no** se incluyeron como comportamiento vigente y se abrieron como propuestas activas en `openspec/changes/` (o permanecen pendientes):

1. Políticas `ENABLE` / `FORCE ROW LEVEL SECURITY` sobre las tablas `ofi_*` de `OficiOS` (abierto en `openspec/changes/add-oficios-rls-policies/`).
2. Autenticación real OIDC/JWT/MFA en reemplazo de las cabeceras de prueba `x-tenant-id`, `x-test-role` y `x-actor-id` en `OficiOS` (abierto en `openspec/changes/replace-oficios-test-headers-auth/`).
3. Emisión fiscal real contra staging/producción de Hacienda con certificados `.p12` y KMS (`QG-07`).
4. Proveedor real con GPU / Workers AI para `@quimera/adapter-clairic`.
