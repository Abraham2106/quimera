# ADR-001: Monorepo Modular vs. Repositorios Independientes

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-CORE-002`, `QR-CORE-003`, `QR-NFR-008`, `QR-NFR-010`

## Contexto
QUIMERA consta de 6 paquetes de infraestructura (`@quimera/core`, `data-exodus`, `cr-api-passport`, `fiscal-outbox`, `factura-ci`, `pipeline`), un adaptador opcional (`adapter-clairic`) y aplicaciones consumidoras (`apps/oficios`, `apps/demo-pos`). Debe poder instalarse cada paquete por separado sin perder velocidad de iteración en un equipo pequeño ni romper contratos entre versiones.

## Problema
Elegir una organización de repositorio que simultáneamente permita: (a) atomicidad de cambios en contratos compartidos durante el desarrollo del MVP y (b) garantía verificable de independencia de publicación e instalación por paquete.

## Alternativas evaluadas
1. **Monorepo modular con `pnpm` workspaces + Turborepo + Changesets.**
2. **Múltiples repositorios independientes (polyrepo)**, uno por paquete desde el día 1.
3. **Paquete monolítico único** con subrutas exportadas.

## Criterios de decisión
Velocidad de desarrollo en MVP, facilidad de mantener contratos sincronizados, aislamiento real de dependencias por paquete, experiencia de contribución OSS y madurez probada en el ecosistema Dojo.

## Evidencia relevante
- `DojoCodingLabs/hacienda-cr` y `DojoCodingLabs/whatsapp-adapter` operan exitosamente en producción con `pnpm` workspaces + Turborepo + `tsup` + Changesets, publicando paquetes independientes en npm.
- Un polyrepo en etapa pre-v1 multiplica el costo de sincronizar contratos de `@quimera/core` entre 7 repositorios.
- Un paquete monolítico viola el requisito fundamental de instalar `Data Exodus` sin arrastrar `OficiOS`, `Factura CI` ni `Clairic`.

## Decisión
Adoptar un **Monorepo modular con `pnpm` workspaces + Turborepo + Changesets**, separando físicamente librerías reutilizables en `packages/*` y aplicaciones consumidoras en `apps/*`, con reglas automáticas de CI (`pnpm test:isolation`) que instalan y prueban cada paquete en aislamiento total.

## Consecuencias
- **Positivas:** Refactorizaciones atómicas de contratos, CI unificado, publicación independiente a npm (`@quimera/*`) y pruebas E2E integradas.
- **Negativas:** Requiere disciplina de reglas ESLint/grafo de dependencias para evitar fugas entre `packages/*` y `apps/*`.

## Riesgos
- **Riesgo:** Acoplamiento accidental por comodidad del monorepo.
- **Mitigación:** Gate de CI que valida `package.json` y ejecuta instalación aislada por paquete (`QR-CORE-003`).

## Condiciones de revisión
Si `OficiOS` evoluciona a un producto SaaS comercial con ciclo de release, equipo y repositorio privado propios, deberá extraerse a su propio repositorio consumiendo `@quimera/*` desde npm.
