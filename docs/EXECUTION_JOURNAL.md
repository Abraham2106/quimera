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
