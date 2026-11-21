## Contenedores, salud y apagado ordenado

- [x] Crear Dockerfiles multi-stage no root para `oficios-api` (con build web) y `fiscal-outbox-worker`.
- [x] Implementar `/healthz`, `/readyz` y manejador `SIGTERM` que drene conexiones activas y *leases* del outbox sin truncar entregas en curso.

## Observabilidad y auditoría B2B

- [x] Instrumentar correlación de `request_id`/`tenant_id`/`clave`, redacción estricta de secretos/PII y soporte opcional OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT`).
- [x] Crear tabla append-only `saas_audit_logs` con `FORCE ROW LEVEL SECURITY` y endpoint de consulta para `ADMIN` y `AUDITOR_READONLY`.

## CI y supply chain

- [x] Añadir `QUIMERA_AI_ENABLED=false pnpm demo:verify` y escaneo de secretos (`gitleaks`) en `.github/workflows/ci.yml`.
- [x] Añadir workflow de SBOM CycloneDX / SAST y pruebas automatizadas `T-SEC-002` y `T-SEC-011`; validar con `pnpm verify` y `pnpm spec:validate`.
