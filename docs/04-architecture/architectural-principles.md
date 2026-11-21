# Principios Arquitectónicos — QUIMERA

- **Documento:** `docs/04-architecture/architectural-principles.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Normativo para diseño, PRs y revisiones de arquitectura

---

## 1. Principios fundamentales

| ID | Principio | Declaración normativa | Consecuencia verificable en diseño |
|---|---|---|---|
| `AP-01` | **Determinismo primero (AI-Optional Baseline)** | Todo flujo central de QUIMERA debe operar de forma determinista y completa sin modelos de IA, sin GPU y sin inferencia externa. | Ningún paquete en `packages/*` (salvo `adapter-clairic`) importa SDKs de IA; toda extracción IA entra por `StructuredExtractorPort` y exige validación tipada + compuerta humana en datos críticos. |
| `AP-02` | **Modularidad estilo Apache (independencia operativa)** | Cada componente tiene una responsabilidad delimitada, funciona por sí mismo y puede instalarse sin arrastrar aplicaciones consumidoras ni módulos hermanos innecesarios. | Monorepo `pnpm` con fronteras estrictas verificadas en CI: `@quimera/core` tiene dependencias mínimas; `apps/oficios` jamás es importada por `packages/*`. |
| `AP-03` | **Procedencia antes que conveniencia** | Nunca se sacrifica la trazabilidad de origen ni se oculta una ambigüedad para producir una carga «bonita». | Cero fusiones silenciosas ante ambigüedad; `source_artifacts`, `provenance_entries` y `resolution_decisions` son `append-only`; cada saldo o entidad migrada traza hasta archivo, hash SHA-256 y fila/xpath. |
| `AP-04` | **No reinventar infraestructura madura** | Se reutiliza software probado y licenciado compatiblemente antes de escribir código propio. | `@dojocoding/hacienda-sdk` gestiona XML 4.4, firma XAdES-EPES y state machine base; PostgreSQL gestiona ACID, `JSONB`, `pg_trgm`, RLS y `SKIP LOCKED`; `fast-check` gestiona property testing. |
| `AP-05` | **Contratos explícitos y versionados** | Toda comunicación entre módulos, pipelines y APIs externas ocurre mediante contratos tipados (Zod + JSON Schema Draft 2020-12) con Semantic Versioning. | Incompatibilidad de versión `MAJOR` falla antes de ejecutar (fail-fast); las APIs externas pasan por `CR API Passport` con detección de deriva. |
| `AP-06` | **Honestidad ante incertidumbre distribuida** | Nunca se promete «exactly-once» mágico sobre redes no confiables ni se interpreta un timeout como rechazo o no-envío. | `Pipeline` y `Fiscal Outbox` modelan entrega **at-least-once + idempotencia + reconciliación explícita**; tras un timeout post-POST a Hacienda solo se consulta por la misma `clave`. |
| `AP-07` | **Aislamiento multi-tenant y fiscal desde el día 1** | Las fronteras entre empresas (`tenantId`) y entre emisores fiscales (`issuerId`) son ciudadanos de primera clase en el esquema, nunca un añadido tardío. | `tenant_id NOT NULL` en tablas de negocio; consecutivos fiscales particionados estrictamente por `(issuer_id, environment, document_type, branch, pos)`; cero secretos compartidos en memoria entre emisores. |
| `AP-08` | **Reproducibilidad offline y testeabilidad determinista** | Todo escenario de prueba y demostración crítica debe poder ejecutarse en local o CI sin internet, sin credenciales productivas y sin datos reales de personas. | Reloj inyectable (`ClockPort`), fixtures sintéticos versionados, modo `fixture` en Passport y simulador loopback exclusivo en Factura CI. |
| `AP-09` | **Simplicidad justificada sobre ceremonia** | Evitar microservicios, Event Sourcing total, CQRS distribuido y frameworks pesados mientras un monolito modular sobre Node 22 + PostgreSQL cubra la carga con mayor confiabilidad. | Un único runtime canónico (Node 22+ TS), una única base transaccional (PostgreSQL 16+), procesos CLI/worker simples y puertos claros para evolución futura. |
| `AP-10` | **Seguridad por defecto en fronteras no confiables** | Todo documento ingresado (CSV, XLSX, XML, texto/imagen para Clairic) y toda respuesta externa se tratan como entrada potencialmente hostil. | Bloqueo XXE, límite anti-zip-bomb, neutralización CSV Formula Injection al exportar, loopback-only en simuladores y redacción obligatoria de secretos en logs. |
