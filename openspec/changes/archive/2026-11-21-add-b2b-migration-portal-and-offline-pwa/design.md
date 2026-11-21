# Diseño técnico: Workbench web de migración y PWA offline para técnicos

## Consola web de migración (`Data Exodus` en SaaS)

1. Endpoints HTTP bajo `/api/v1/migrations/*` (solo roles `ADMIN` u `OPERATOR` autorizados):
   - `POST /api/v1/migrations/uploads`: multipart con límite de tamaño, detección de zip-bomb/XXE y almacenamiento en `ArtifactStorePort`.
   - `POST /api/v1/migrations/:runId/profile`: ejecuta `profileTables` + `proposeMapping` y devuelve columnas y marcas `NEEDS_REVIEW`.
   - `GET /api/v1/migrations/:runId/conflicts` y `POST /api/v1/migrations/:runId/decisions`: muestra conflictos detectados por el motor de reconciliación y persiste decisiones inmutables con `actor_id` verificado por JWT.
   - `POST /api/v1/migrations/:runId/resume`: reanuda el pipeline desde el checkpoint validando SHA-256 del artefacto.

## Evidencia fotográfica en diagnóstico (`OficiOS`)

- Endpoint `POST /api/v1/work-orders/:id/attachments` validando MIME (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), límite de tamaño por archivo (ej. 5 MiB) y persistencia en `ArtifactStorePort` ligada al `tenant_id` y a la orden.

## Modo offline PWA para técnicos en campo

1. Manifest PWA + Service Worker con caché de assets estáticos de la app.
2. Cola local en IndexedDB para borradores de diagnóstico, materiales y fotos capturadas sin señal; cada operación lleva un `client_mutation_id` (UUID) y el `version` (etag/revision) de la orden.
3. Al reconectar, sincroniza en orden FIFO: el servidor aplica idempotencia por `client_mutation_id` y devuelve HTTP `409` si la orden fue modificada concurrentemente por otro actor, mostrando resolución explícita sin pisar cambios ni duplicar un `FiscalIntent`.
