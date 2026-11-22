# Hoja de ruta OpenSpec: de Demo Offline a SaaS B2B en Producción

Este documento ordena los cambios de `openspec/changes/` que llevan QUIMERA / OficiOS desde el MVP offline verificado hasta una aplicación **B2B / SaaS multi-tenant** operando con clientes reales y emisión fiscal en Costa Rica. Todos están archivados.

Ningún cambio rompe las invariantes base del repositorio: `pnpm verify` sigue corriendo 100% offline, `@quimera/*` mantiene aislamiento sin depender de `OficiOS` ni `Clairic` (`pnpm test:isolation`) y `Factura CI` permanece loopback-only (`ERR_SEC_LOOPBACK_ONLY`).

Las **cuatro oleadas** originales del SaaS B2B y el cambio de adaptadores productivos están **archivados** bajo `openspec/changes/archive/2026-11-21-*`. El staging verificable quedó en [`production-adapters-and-staging`](changes/archive/2026-11-21-production-adapters-and-staging/proposal.md).

---

## Secuencia por oleadas y dependencias

### Oleada 1 — Fundaciones de seguridad multi-tenant (archivada)

| Orden | Cambio OpenSpec | Capacidad | Qué desbloquea |
| --- | --- | --- | --- |
| 1 | [`add-oficios-rls-policies`](changes/archive/2026-11-21-add-oficios-rls-policies/proposal.md) | `oficios-workshop-flow` (delta) | Aislamiento real en PostgreSQL (`FORCE ROW LEVEL SECURITY`) para todas las tablas `ofi_*`. **Archivado.** |
| 2 | [`replace-oficios-test-headers-auth`](changes/archive/2026-11-21-replace-oficios-test-headers-auth/proposal.md) | `oficios-auth-rbac` | Reemplaza cabeceras sintéticas (`x-tenant-id`, `x-test-role`) por JWT/OIDC verificado y RBAC `401`/`403`. **Archivado.** |

**Puerta de salida (Oleada 1):** `OficiOS` ya puede desplegarse detrás de HTTPS sin riesgo de suplantación ni fuga de datos entre tenants en PostgreSQL.

---

### Oleada 2 — Ciclo de vida B2B, almacenamiento durable y emisión fiscal en sandbox (archivada)

| Orden | Cambio OpenSpec | Capacidad | Qué desbloquea |
| --- | --- | --- | --- |
| 3 | [`add-b2b-tenant-onboarding-lifecycle`](changes/archive/2026-11-21-add-b2b-tenant-onboarding-lifecycle/proposal.md) | `saas-tenant-onboarding` | Alta transaccional de organizaciones PYME, invitaciones hasheadas con expiración, protección del último `ADMIN` y suspensión/exportación. **Archivado.** |
| 4 | [`add-cloud-cas-retention-and-pitr`](changes/archive/2026-11-21-add-cloud-cas-retention-and-pitr/proposal.md) | `saas-storage-compliance` | Adaptador S3/R2 con verificación SHA-256, retención WORM de 5 años (1.825 días), tablas append-only (`REVOKE UPDATE, DELETE`), Ley 8968 y respaldos PITR. **Archivado.** |
| 5 | [`add-hacienda-production-fiscal-delivery`](changes/archive/2026-11-21-add-hacienda-production-fiscal-delivery/proposal.md) | `hacienda-live-delivery` + `fiscal-outbox-sequences` (delta) | `FORCE RLS` en `fob_*`, bóveda KMS para `.p12`/PIN/IDP, worker dedicado sobre `@dojocoding/hacienda-sdk` y compuerta `sandbox` → `production` (`QG-07`). **Archivado.** |

**Puerta de salida (Oleada 2 — Piloto B2B Privado):** talleres piloto reales pueden operar con cuentas propias, evidencia resguardada por 5 años y emisión real validada primero en sandbox y luego promovida a producción de Hacienda.

---

### Oleada 3 — Autoservicio B2B en web y resiliencia en campo (archivada)

| Orden | Cambio OpenSpec | Capacidad | Qué desbloquea |
| --- | --- | --- | --- |
| 6 | [`add-b2b-migration-portal-and-offline-pwa`](changes/archive/2026-11-21-add-b2b-migration-portal-and-offline-pwa/proposal.md) | `saas-web-workbench-pwa` + `oficios-workshop-flow` (delta) | Consola web de `Data Exodus` (sin CLI), carga real de fotos de diagnóstico y PWA offline con cola IndexedDB e idempotencia (`409` ante conflictos). **Archivado.** |

**Puerta de salida (Oleada 3):** onboarding de nuevos talleres sin intervención de ingeniería en terminal y uso real por técnicos en campo con conectividad intermitente.

---

### Oleada 4 — Monetización SaaS, operación continua y supply chain (archivada)

| Orden | Cambio OpenSpec | Capacidad | Qué desbloquea |
| --- | --- | --- | --- |
| 7 | [`add-saas-billing-plans-and-quotas`](changes/archive/2026-11-21-add-saas-billing-plans-and-quotas/proposal.md) | `saas-billing-entitlements` | Planes, webhooks idempotentes firmados (HMAC), cuotas (`HTTP 402`) y garantía de nunca interrumpir comprobantes fiscales ya encolados. **Archivado.** |
| 8 | [`add-saas-observability-deployment-and-ci-gates`](changes/archive/2026-11-21-add-saas-observability-deployment-and-ci-gates/proposal.md) | `saas-operations-observability` | Contenedores no root (`oficios-api` + `fiscal-outbox-worker`), `/healthz`/`/readyz`, apagado ordenado, OpenTelemetry sin PII, bitácora de auditoría B2B y `gitleaks`/SBOM/`demo:verify` en CI. **Archivado.** |

**Puerta de salida (Oleada 4 — SaaS B2B General Availability):** plataforma lista para cobro recurrente, operación multi-cliente con SLOs medibles, auditoría por organización y cadena de suministro endurecida.

---

### Adaptadores productivos y staging (archivado)

| Cambio | Capacidad |
| --- | --- |
| [`production-adapters-and-staging`](changes/archive/2026-11-21-production-adapters-and-staging/proposal.md) | S3/KMS productivos configurables, worker con transporte loopback/Hacienda, bundle estático, compose staging y verificación E2E local/cloud. **Archivado.** |

---

## Cómo ejecutar cada cambio con OpenSpec

1. Elegí el siguiente cambio en orden de oleada y consultá sus artefactos con `pnpm exec openspec show <change>`.
2. Implementá las tareas de `openspec/changes/<change>/tasks.md` en una rama dedicada siguiendo el diseño y los escenarios `WHEN`/`THEN`.
3. Verificá localmente con `pnpm verify` y `pnpm audit --audit-level=high`.
4. Al completar todas las tareas y pruebas, archivá el cambio con `pnpm exec openspec archive <change>` para sincronizar sus deltas en `openspec/specs/` y conservar el registro en `openspec/changes/archive/YYYY-MM-DD-<change>/`.