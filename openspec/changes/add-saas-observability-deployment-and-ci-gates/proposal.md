# Despliegue productivo, observabilidad, bitácora de auditoría B2B y endurecimiento de CI

## Why

Pasar de un demo local en `127.0.0.1` a un SaaS B2B operado por múltiples empresas requiere topología de despliegue reproducible en contenedores, sondas de salud y apagado ordenado (drenando *leases* del outbox fiscal), observabilidad correlacionada sin fuga de PII, una bitácora de auditoría consultable por cada cliente B2B y controles de supply chain en CI (`gitleaks`, `demo:verify`, SBOM y SAST) que hoy siguen documentados como pendientes para producción.

## What changes

Definir la capacidad `saas-operations-observability` cubriendo: contenedores endurecidos sin root (`oficios-api`, `fiscal-outbox-worker`, bundle web estático), endpoints `/healthz` y `/readyz`, apagado grácil, telemetría estructurada correlacionada (`request_id`, `tenant_id`, `run_id`, `clave`) con redacción PII, bitácora de auditoría B2B append-only por tenant y compuertas CI ampliadas (`demo:verify`, `gitleaks`, SBOM CycloneDX y SAST).

## Impact

- Archivos y procesos afectados: `Dockerfile`(s) de producción, `apps/oficios/src/server.ts`, worker fiscal, migración `saas_audit_logs` con `FORCE ROW LEVEL SECURITY` y `.github/workflows/ci.yml`.
- Mantiene el perfil local offline de desarrollo sin exigir servicios cloud para ejecutar `pnpm verify`.

## Fuera de alcance

- Elección de proveedor específico de observabilidad (se integra mediante JSON estructurado y OpenTelemetry estándar OTLP).
- Multi-región activo-activo (fuera del alcance de la primera etapa B2B en Costa Rica).
