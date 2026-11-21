# Requisitos de Seguridad y Brecha MVP vs Producción — QUIMERA

- **Versión:** 1.0.1
- **Fecha:** 2026-11-21
- **Estado:** Alineado con `requirements-catalog.md` v1.0.0
- **Referencias:** [Modelo de Amenazas](./threat-model.md) | [Catálogo de Requisitos QR-SEC-001..012](../03-requirements/requirements-catalog.md)

---

## 1. Principio de Seguridad Proporcional

QUIMERA no pospone controles fundamentales de aislamiento e integridad (que son igual de baratos de diseñar bien desde el inicio), pero **sí distingue con total transparencia** qué garantías estarán activas en el MVP de hackathon frente a las exigidas antes de operar datos reales o emisión fiscal de producción para PYMEs.

---

## 2. Garantías de Seguridad: MVP vs Producción (Alineadas 1:1 con `QR-SEC-001`..`012`)

| ID Requisito | Control de Seguridad | Garantía en MVP (Hackathon / Dev Local) | Garantía Exigida para Producción (PYMEs / Fiscal Real) | Prueba |
|---|---|---|---|---|
| `QR-SEC-001` | **Aislamiento multi-tenant** | `tenant_id NOT NULL` en toda tabla, claves únicas compuestas, filtros obligatorios + suite `T-SEC-001` y `FC-020..022` verificando cero fugas entre 2 tenants. | Activación obligatoria de **PostgreSQL RLS (`FORCE ROW LEVEL SECURITY`)** con rol de BD sin `BYPASSRLS` + verificación por conexión de pool. | `T-SEC-001`, `T-FCI-006` |
| `QR-SEC-002` | **Gestión y redacción de secretos** | Lectura exclusiva por variables de entorno (`.env` en `.gitignore`), cero secretos en argv CLI, redacción en `pino`/errores, `gitleaks` en CI. | Secret Manager externo (AWS/GCP Secrets Manager, Vault o Doppler) con rotación periódica y mínimo privilegio. | `T-SEC-002` |
| `QR-SEC-003` | **Sanitización de documentos de entrada** | Bloqueo XXE/`DOCTYPE` en XML, límite Zip-bomb XLSX (default 50 MiB descomprimido), bloqueo path traversal y neutralización CSV Formula Injection (`=`, `+`, `-`, `@`) al exportar. | Escaneo antimalware en cuarentena previo a ingestión + cuotas de almacenamiento por tenant. | `T-SEC-003` |
| `QR-SEC-004` | **Defensa contra Prompt Injection (Clairic / MCP)** | Baseline 100% libre de IA; contrato `StructuredExtractorPort` encapsula texto en `state` sin herramientas ejecutables y exige compuerta humana en baja confianza o campos sensibles. | Aislamiento de red saliente para worker de IA + auditoría de extracciones con redacción PII. | `T-SEC-004` |
| `QR-SEC-005` | **Inmutabilidad append-only de evidencia y auditoría** | Sin operaciones `UPDATE`/`DELETE` en repositorios de `source_artifacts`, `provenance_entries`, `resolution_decisions` y `fiscal_attempts`; enmiendas usan `supersedes_decision_id`. | `REVOKE UPDATE, DELETE` a nivel de rol PostgreSQL + triggers de inmutabilidad + WORM/Object Lock en S3/R2. | `T-SEC-005` |
| `QR-SEC-006` | **Verificación criptográfica de integridad CAS** | Recálculo y verificación de `SHA-256` al leer artefactos críticos para auditoría o reanudación (`ERR_ARTIFACT_INTEGRITY_FAILED` ante alteración de 1 byte). | Verificación periódica automatizada (`quimera verify-artifacts`) + replicación georredundante. | `T-SEC-006` |
| `QR-SEC-007` | **Protección de certificados `.p12` y llaves privadas** | Cero certificados reales en MVP; `.gitignore` bloquea `*.p12`/`*.pfx`; verificación de expiración previa a firma; backend/CLI local únicamente (nunca frontend ni MCP). | Envelope encryption con KMS por tenant, acceso restringido exclusivamente al proceso `Fiscal Outbox`, alerta de vencimiento 30 días antes. | `T-SEC-007` |
| `QR-SEC-008` | **Autenticación y RBAC en API de OficiOS** | Roles declarados (`ADMIN`, `OPERATOR`, `AUDITOR_READONLY`) vinculados a `tenant_id` con middleware verificable (bloqueo `403` para `AUDITOR_READONLY` en mutaciones). | Autenticación robusta (OIDC / Passkeys / JWT con rotación + MFA para administradores) y auditoría de sesiones. | `T-SEC-008` |
| `QR-SEC-009` | **Clasificación PII (Ley 8968 CR) y fixtures sintéticos** | Metadato `pii: true` en campos personales, minimización en logs y prohibición estricta de cédulas o datos reales en fixtures del repositorio. | Procedimiento formal de rectificación/seudonimización Ley 8968 y revisión legal en Costa Rica. | `T-SEC-009` |
| `QR-SEC-010` | **Retención fiscal de 5 años (1.825 días)** | Política documentada y metadato `retentionUntil` soportado en `ArtifactStorePort` / diseño de BD. | Políticas automáticas de retención/Object Lock de 5 años en S3/R2 + backups PITR auditados. | `T-SEC-010` |
| `QR-SEC-011` | **Supply chain y cero ejecución arbitraria de scripts** | `pnpm-lock.yaml` congelado, `pnpm audit --audit-level=high`, exclusión de licencias incompatibles (BSL 1.1), manifiestos declarativos sin `eval`. | SBOM CycloneDX por release, OIDC Provenance en npm, firma de imágenes Docker (Cosign) y SAST continuo (CodeQL). | `T-SEC-011` |
| `QR-SEC-012` | **Aislamiento loopback-only y anti-SSRF en simuladores** | Simulador de `Factura CI` y modos mock restringidos estrictamente a `127.0.0.1` / `::1` sin redirecciones salientes (`ERR_SEC_LOOPBACK_ONLY`). | Invariante permanente: `Factura CI` jamás puede apuntar ni autenticarse contra producción de Hacienda. | `T-SEC-012` |

---

## 3. Reglas No Negociables para Todo Contribuidor / Agente de Código

1. Nunca commitear archivos `.p12`, `.pfx`, `.pem`, `.env` con credenciales reales ni dumps de datos reales de clientes costarricenses.
2. Nunca construir consultas SQL mediante concatenación de strings (usar exclusivamente Drizzle ORM parametrizado).
3. Nunca exponer endpoints de firma fiscal o mutación de migraciones en un servidor MCP público.
4. Nunca deshabilitar verificación TLS (`NODE_TLS_REJECT_UNAUTHORIZED=0` prohibido en código y CI).
