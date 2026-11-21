# Estrategia de Releases y Distribución Técnica — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para MVP y Beta Técnica
- **Referencias:** [ADR-001](../04-architecture/ADR/ADR-001-monorepo-modular.md) | [Política de Versionado](../06-interfaces/versioning-policy.md) | [Quality Gates](../08-quality/quality-gates.md)

---

## 1. Artefactos Publicables Independientes

| Paquete / Artefacto | Canal de distribución | Publicado en npm | Instalable standalone |
|---|---|---|---|
| `@quimera/core` | npm público (MIT) | Sí | Sí |
| `@quimera/data-exodus` | npm público (MIT) | Sí | Sí (depende solo de `@quimera/core` + deps propias) |
| `@quimera/cr-api-passport` | npm público (MIT) + skill en Dojo Marketplace (post-MVP) | Sí | Sí |
| `@quimera/fiscal-outbox` | npm público (MIT) | Sí | Sí |
| `@quimera/factura-ci` | npm público (MIT) + GitHub Action (Beta) | Sí | Sí |
| `@quimera/pipeline` | npm público (MIT) | Sí | Sí |
| `@quimera/adapter-clairic` | npm público opcional (MIT) | Sí (Post-MVP) | Sí (nunca dependencia obligatoria) |
| `apps/oficios` | Imagen Docker / repositorio aplicación | **No** (aplicación) | Sí (consumidor) |
| `apps/demo-pos` | Solo repositorio (referencia de pruebas) | **No** | N/A |

---

## 2. Flujo Automatizado de Releases (Changesets + GitHub Actions)

1. Cada PR con cambio funcional o de contrato incluye un archivo `.changeset/*.md` indicando paquete(s) y tipo de bump (`patch`/`minor`/`major`).
2. Al fusionar en `main`, Changesets abre/actualiza un PR automatizado de release (`Version Packages`) que actualiza `package.json` y `CHANGELOG.md`.
3. Antes de publicar, el workflow ejecuta **`QG-05`**:
   - Typecheck, lint de fronteras, tests unitarios/integración/seguridad.
   - Pruebas de aislamiento (`T-CORE-003`): empaqueta con `pnpm pack` cada librería y la instala en un directorio temporal vacío comprobando que corre sin `OficiOS` ni `Clairic`.
   - Regeneración y verificación de JSON Schemas Draft 2020-12.
4. En publicaciones públicas (Beta / v1+), los paquetes se publican en npm con `--provenance` (OIDC) y etiquetado git por paquete (`@quimera/cr-api-passport@0.1.0`).

---

## 3. Canales de Versión (Dist-Tags)

- `alpha` / `0.1.0-hackathon.x`: Snapshot estable del MVP de hackathon.
- `beta` / `0.x.y`: Releases de Beta Técnica con feedback de desarrolladores locales.
- `latest` / `1.0.0+`: Releases estables con garantía SemVer estricta y compatibilidad `N-1`.

---

## 4. Política de Rollback de Releases

- En npm no se borran versiones publicadas (para no romper lockfiles); si una versión presenta un defecto crítico, se ejecuta `npm deprecate @quimera/<pkg>@<ver> "Razón + usar <ver_fija>"` y se libera inmediatamente un `PATCH` correctivo.
- En migraciones de base de datos PostgreSQL nunca se borran archivos `.sql` publicados; cualquier corrección se libera como nueva migración hacia adelante (*forward-only*).
