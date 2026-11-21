# Diseño técnico: Despliegue productivo, observabilidad y auditoría B2B

## Topología de despliegue (Perfil 2 de `deployment-architecture.md`)

1. Imágenes multi-stage de Node.js 22 LTS corriendo con usuario no root (`USER node`) y sistema de archivos de solo lectura salvo `/tmp`:
   - `oficios-api`: API HTTP Hono + assets estáticos compilados de `apps/oficios/web`.
   - `fiscal-outbox-worker`: proceso independiente que ejecuta `processOnce` contra PostgreSQL y Hacienda sin exponer puertos públicos.
2. Sondas y apagado ordenado:
   - `GET /healthz`: estado vivo del proceso sin tocar dependencias externas.
   - `GET /readyz`: verifica conectividad a PostgreSQL (y validez del rol no superusuario) antes de recibir tráfico.
   - Al recibir `SIGTERM`, deja de aceptar peticiones/reclamar nuevos *leases*, espera la finalización de transacciones activas dentro del timeout y libera limpiamente los recursos.

## Telemetría, alertas y bitácora de auditoría B2B

1. Logs JSON estructurados en `stderr` / stdout de contenedor con `request_id`, `tenant_id`, `actor_sub`, `run_id` y `clave`, pasando siempre por un filtro de redacción que enmascara tokens, PINs, contraseñas y PII sensible.
2. Exportación opcional de trazas y métricas vía OpenTelemetry (`OTEL_EXPORTER_OTLP_ENDPOINT`) para latencia HTTP, tasa de errores `429`/`5xx` de Hacienda, profundidad de cola del outbox y días restantes de certificados `.p12`.
3. Tabla `saas_audit_logs` (append-only, `FORCE ROW LEVEL SECURITY`, sin `UPDATE`/`DELETE` para el rol de aplicación) registrando acciones B2B críticas: cambios de rol/invitaciones, configuración fiscal, aprobación de presupuestos, cierre de órdenes y decisiones de migración, consultable por `ADMIN` y `AUDITOR_READONLY` con paginación y filtros.

## Endurecimiento de CI y supply chain

- Agregar en `.github/workflows/ci.yml`: `QUIMERA_AI_ENABLED=false pnpm demo:verify`, escaneo de secretos (`gitleaks`), generación de SBOM CycloneDX en releases y análisis estático (CodeQL) más cobertura de los casos `T-SEC-002`, `T-SEC-007`, `T-SEC-009`, `T-SEC-010` y `T-SEC-011`.
