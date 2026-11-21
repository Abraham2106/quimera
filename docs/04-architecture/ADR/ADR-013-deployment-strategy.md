# ADR-013: Estrategia de Despliegue Local-First y Adopción Diferida de Cloudflare

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-NFR-008`, `QR-NFR-009`, `QR-NFR-011`, `QR-OUT-007`

## Contexto
QUIMERA debe poder demostrarse de forma reproducible en un hackathon (incluso sin red estable), instalarse fácilmente por desarrolladores y agencias locales, y escalar posteriormente a despliegues de producción para PYMEs.

## Problema
Decidir la plataforma objetivo de despliegue para MVP y definir el papel real (no decorativo) de Cloudflare Workers, Workflows, Durable Objects y R2.

## Alternativas evaluadas
1. **Local-first sobre Node.js 22+ y PostgreSQL 16+ (Docker Compose en local/CI; contenedor estándar + PG gestionado + S3/R2 en producción)**, con puertos que habilitan extensiones opcionales en Cloudflare (R2, Workers para Passport HTTP, Workflows/DO para Outbox) post-MVP.
2. **Despliegue nativo obligatorio en Cloudflare Workers + Workflows + Durable Objects + D1** desde el día 1.
3. **Kubernetes + Helm** para cada módulo.

## Criterios de decisión
Compatibilidad real con `@dojocoding/hacienda-sdk` (Node 22+, `node-forge`, `xmllint-wasm`), reproducibilidad offline, baja fricción operativa para PYMEs y ausencia de lock-in.

## Evidencia relevante
- `@dojocoding/hacienda-sdk@0.13.0` requiere Node.js 22+ para firma XAdES-EPES y validación XSD (`xmllint-wasm`).
- Cloudflare Queues es *at-least-once* y Workflows reintenta pasos (límite 1 MiB/paso); no sustituye la transacción ACID de reserva de consecutivos ni el registro de intención comercial.
- Un contenedor Node 22 + PostgreSQL 16 funciona idénticamente en la laptop del juez, en GitHub Actions y en cualquier proveedor cloud (Fly.io, Railway, VPS, AWS, Supabase).

## Decisión
Adoptar **despliegue Local-First sobre Node.js 22+ + PostgreSQL 16+** como perfil canónico de MVP y producción inicial. Reservar el ecosistema Cloudflare exclusivamente para donde aporta valor demostrado post-MVP: **R2** (almacenamiento CAS barato sin egress), **Workers** (hosting stateless de `CR API Passport` / MCP `2026-07-28`), **Workers AI** (adaptador opcional Clairic) y **Workflows/DO** (adaptador opcional `OutboxSchedulerPort` a mayor escala).

## Consecuencias
- **Positivas:** Demo 100% determinista sin depender de cuentas cloud ni red; costo cero en local/CI; cero vendor lock-in.
- **Negativas:** En despliegues multi-réplica futuros habrá que coordinar cuota global de rate-limit (ya contemplado en diseño mediante adaptador compartido de caché/rate-limit).

## Riesgos
- **Riesgo:** Diferencias entre disco local CAS en MVP y bucket R2/S3 en producción.
- **Mitigación:** Pruebas de contrato sobre `ArtifactStorePort` ejecutables contra ambos adaptadores.

## Condiciones de revisión
Evaluar despliegue serverless de `CR API Passport` en Cloudflare Workers durante la fase Beta Técnica para ofrecer verificación continua pública a la comunidad CR.
