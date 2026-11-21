## Workbench web de Data Exodus

- [ ] Exponer endpoints `/api/v1/migrations/*` (carga segura, perfilado, consulta de conflictos, registro de decisiones inmutables y reanudación de pipeline) con RBAC y RLS.
- [ ] Construir vistas en `apps/oficios/web/` para subir archivos, revisar `NEEDS_REVIEW`, resolver conflictos y lanzar la carga verificada sin usar la CLI.

## Adjuntos de diagnóstico y PWA offline

- [ ] Implementar carga y descarga autorizada de evidencia fotográfica en diagnósticos respaldada por `ArtifactStorePort`.
- [ ] Agregar manifest PWA, Service Worker y cola de sincronización en IndexedDB con `client_mutation_id` y control optimista de versión (`409`).

## Pruebas y verificación

- [ ] Agregar pruebas E2E de flujo web de migración, rechazo de archivos inválidos/XXE, carga de adjuntos y sincronización idempotente tras reconexión.
- [ ] Ejecutar `pnpm verify`, `pnpm test:isolation` y `pnpm spec:validate` en verde.
