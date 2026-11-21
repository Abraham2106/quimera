# Puertas de Calidad (Quality Gates) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Normativo para CI/CD y demos
- **Referencias:** [Estrategia de Pruebas](./test-strategy.md) | [Política de Versionado](../06-interfaces/versioning-policy.md) | [Definition of Done](../11-implementation/definition-of-done.md)

---

## Resumen de las 7 Puertas de Calidad

| Gate | Evento disparador | Verificaciones obligatorias (todas deben pasar) | Acción ante fallo |
|---|---|---|---|
| **`QG-01`** | **Pull Request (todo cambio)** | 1. `pnpm typecheck` (`tsc --noEmit` en `strict`)<br/>2. `pnpm lint` (incluyendo regla de fronteras: `packages/*` nunca importa `apps/*` ni `@quimera/adapter-clairic`)<br/>3. `pnpm test:unit` + `fast-check` property tests<br/>4. `pnpm test:integration` (PostgreSQL 16 efímero)<br/>5. `pnpm test:security` + `gitleaks` + `pnpm audit --audit-level=high`<br/>6. Cobertura ≥ 80% en `core`, `data-exodus` y `fiscal-outbox` `[HIPÓTESIS]` | Bloqueo automático de merge en GitHub |
| **`QG-02`** | **Nueva integración externa (`CR API Passport`)** | 1. Manifiesto valida contra `ApiPassportSchema`<br/>2. Incluye fuente oficial verificable (`docsUrl`, `lastVerifiedAt`)<br/>3. Clasificación explícita de `auth`, `rateLimit` conservador y `privacy`<br/>4. Fixtures offline grabados + pruebas de deriva (`T-PASS-003`)<br/>5. Si es API privada, prohibido inventar endpoints (`accessTier: "private_contract_required"`) | Rechazo de integración |
| **`QG-03`** | **Cambio en contratos (`packages/core/src/contracts/*` o `passports/*`)** | 1. Regeneración de JSON Schema Draft 2020-12 (`pnpm schemas:export` sin diff sin commitear)<br/>2. Prueba de compatibilidad contra contratos en `main` (`N-1`)<br/>3. Si existe cambio breaking, exige bump SemVer `MAJOR` + Changeset explícito | Bloqueo de PR |
| **`QG-04`** | **Cambio en esquema de BD (`*/drizzle/*`)** | 1. Verificación de inmutabilidad: cero ediciones en migraciones `.sql` ya fusionadas en `main`<br/>2. Ejecución de migraciones desde BD vacía en PostgreSQL 16<br/>3. Verificación de `tenant_id NOT NULL` en toda tabla de negocio nueva y ausencia de `ON DELETE CASCADE` en tablas de evidencia/auditoría | Bloqueo de PR |
| **`QG-05`** | **Release de paquete (`@quimera/*`)** | 1. `QG-01` + `QG-03` + `QG-04` en verde<br/>2. Prueba de instalación aislada por paquete (`T-CORE-003`) sin `OficiOS` ni `Clairic`<br/>3. Ejecución completa E2E offline (`T-CORE-004`)<br/>4. Benchmarks `QR-NFR-001` y `QR-NFR-002` sin regresión >20%<br/>5. Changelog generado vía Changesets | Bloqueo de publicación |
| **`QG-06`** | **Ejecución de Demo (Hackathon / Stakeholders)** | 1. Script reproducible `pnpm demo:verify` corre de principio a fin con **red deshabilitada**<br/>2. Dataset `demo-hvac-1000` detecta exactamente 40+12+7+3+1 anomalías<br/>3. OficiOS bloquea cierre sin aprobación (`409`) y permite cierre tras aprobar<br/>4. `Factura CI` detecta fallos en `demo-pos-buggy` (`exit 1`) y aprueba `demo-pos-outbox` (`exit 0`) | Congelar demo / no presentar cambios sin pasar |
| **`QG-07`** | **Operaciones con efectos fiscales reales (Producción post-MVP)** | 1. Suite completa de `Factura CI` (`FC-001..024` + `FC-031`) al 100% en verde sobre la app candidata<br/>2. Certificados `.p12` validados (no vencidos, cifrados en KMS, fuera de git y fuera de MCP)<br/>3. PostgreSQL RLS activo (`FORCE ROW LEVEL SECURITY`) + backup PITR verificado<br/>4. Pruebas exitosas previas en ambiente **Staging oficial de Hacienda** (fuera de `Factura CI` sintético)<br/>5. Aprobación explícita del responsable técnico y del contribuyente | Prohibido habilitar `environment = 'production'` |
