# Roadmap de Desarrollo y Evolución — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Plan estratégico de evolución por fases (sin estimaciones de calendario arbitrarias)
- **Referencias:** [Plan MVP](./MVP-plan.md) | [Alcance y Prioridades](../03-requirements/scope-and-priorities.md) | [Estrategia de Producto](../12-product-strategy/validation-plan.md)

---

## Principio de Progresión por Evidencia

Cada transición de etapa está gobernada por **criterios técnicos y de validación de mercado verificables** (puertas de etapa), no por fechas arbitrarias. Ninguna capacidad de una etapa posterior puede convertirse en dependencia del MVP.

---

## Etapa 1 — MVP (Dojo AI Hackathon 2026)

- **Alcance técnico:** Slices 1 a 7 (`@quimera/core`, `@quimera/data-exodus` CSV/XLSX/FE-XML, `@quimera/cr-api-passport` con 3 pasaportes, `@quimera/fiscal-outbox` sobre PostgreSQL, `@quimera/factura-ci` con 25 escenarios loopback, `@quimera/pipeline` DAG con checkpoints y compuerta humana, `apps/oficios` para `hvac-refrigeration-v1`).
- **Garantía:** 100% baseline sin IA, 100% reproducible offline, `QG-01` y `QG-06` en verde.
- **Criterio de salida:** Demo E2E completa y pruebas de aislamiento por paquete (`T-CORE-003`) aprobadas.

---

## Etapa 2 — Beta Técnica (Adopción por Desarrolladores en Costa Rica)

- **Enfoque:** Estabilizar paquetes `0.x` en npm y distribuir skills/herramientas en el ecosistema Dojo (`DojoCodingLabs/dojo-marketplace-mcp`).
- **Nuevas capacidades:**
  - Publicación individual en npm de `@quimera/core`, `@quimera/cr-api-passport`, `@quimera/factura-ci`, `@quimera/fiscal-outbox`, `@quimera/data-exodus` y `@quimera/pipeline`.
  - GitHub Action oficial de `Factura CI` (`quimera-dev/factura-ci-action`) con soporte JUnit XML y anotaciones en PR.
  - Despliegue opcional de verificación nocturna en vivo (*live drift check*) de `CR API Passport` (Hacienda + BCCR SDDE + Exoneraciones + SNIT OGC) en Cloudflare Workers stateless (`ADR-013`).
  - Servidor MCP `stdio` + HTTP stateless (spec `2026-07-28`) para `CR API Passport`.
  - Importadores adicionales en `Data Exodus`: SQLite legacy y JSON estructurado (`QR-DATA-014`).
  - Activación de Mutation Testing selectivo (StrykerJS) en reglas de reconciliación y máquina de estados fiscal.
- **Criterio de salida:** Al menos 5 desarrolladores o agencias externas instalando y reportando feedback real sobre `CR API Passport`, `Factura CI` o `Data Exodus`.

---

## Etapa 3 — Pilotos Empresariales (Costa Rica)

- **Enfoque:** Validar disposición a pagar y operación real con 3–5 talleres técnicos HVAC y/o proyectos reales de migración de PYMEs.
- **Nuevas capacidades:**
  - Cumplimiento completo de `QG-07` (PostgreSQL RLS forzado, KMS para `.p12`, almacenamiento CAS S3/R2 con Object Lock de 5 años, backups PITR probados, validación en Staging oficial de Hacienda).
  - Autenticación de producción (OIDC/Passkeys + MFA para `ADMIN`) en `OficiOS`.
  - Modo offline resiliente en móvil (PWA + IndexedDB con cola de sincronización) para técnicos en campo sin señal.
  - Adaptador opcional de notificaciones autorizadas para `OficiOS` sobre `@dojocoding/whatsapp-sdk` (desactivado por defecto, `QR-OFI-007`).
  - Activación opcional de `@quimera/adapter-clairic` (solo para clientes piloto que procesen cotizaciones PDF o fotos de etiquetas con compuerta humana obligatoria).
- **Criterio de salida:** Operación sostenida sin incidentes de integridad ni pérdida de datos, validación de métricas comerciales mínimas (ver `validation-plan.md`).

---

## Etapa 4 — Primera Versión Pública (`v1.0.0`)

- **Enfoque:** Congelación de contratos SemVer `1.0.0`, documentación completa de operación en producción y soporte N-1 garantizado.
- **Nuevas capacidades:**
  - Política de soporte y seguridad formal (`SECURITY.md`, SBOM CycloneDX, OIDC Provenance en npm).
  - Interfaz web dedicada de revisión de conflictos de `Data Exodus` para implementadores y contadores (hoy CLI-first).
  - Segundo y tercer contrato de oficio validado en `OficiOS` (ej. instalación eléctrica o mantenimiento de equipo comercial) solo si la demanda de pilotos lo respalda.
- **Criterio de salida:** Contratos `1.0.0` estables con `QG-05` + `QG-07` verificados.

---

## Etapa 5 — Ecosistema de Plugins

- **Enfoque:** Permitir que la comunidad y agencias contribuyan pasaportes, importadores y contratos de oficio sin modificar los paquetes núcleo.
- **Nuevas capacidades:**
  - Plantillas oficiales (`create-quimera-passport`, `create-quimera-importer`, `create-quimera-trade-contract`) con suite de pruebas de contrato embebida.
  - Registro comunitario verificado de pasaportes y transformadores declarativos (evaluando sandbox WASM para transformaciones personalizadas seguras según `ADR-014`).
  - Adaptadores opcionales de orquestación avanzada (`OutboxSchedulerPort` sobre Cloudflare Workflows / Temporal) para despliegues de alto volumen.

---

## Etapa 6 — Escalamiento Regional (Centroamérica y Latinoamérica)

- **Enfoque:** Extender el patrón probado en Costa Rica a países vecinos con facturación electrónica estructurada y fragmentación de datos PYME similar.
- **Nuevas capacidades:**
  - Extracción del modelo de `CR API Passport` hacia `LATAM API Passport` (paquetes por país: ej. Guatemala FEL, Panamá DGI, El Salvador DTE, Colombia DIAN, México CFDI).
  - Paquetes de reglas de normalización fiscal/identidad por país en `Data Exodus` (RUC, NIT, DUI, RFC).
  - Suites conductuales por país en `Factura CI` reutilizando el mismo motor de inyección de fallos, concurrencia e idempotencia (cambiando únicamente el adaptador de protocolo fiscal nacional).
  - Separación de `apps/oficios` a repositorio propio si su operación SaaS evoluciona con equipo dedicado (`ADR-001`, `ADR-011`).
