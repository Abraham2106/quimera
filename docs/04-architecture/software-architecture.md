# Arquitectura de Software — QUIMERA

- **Documento:** `docs/04-architecture/software-architecture.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Aprobado para implementación (línea base v1.0)
- **Documentos relacionados:** [`C4.md`](./C4.md) · [`component-design.md`](./component-design.md) · [`pipeline-architecture.md`](./pipeline-architecture.md) · [`deployment-architecture.md`](./deployment-architecture.md) · [`ADR/README.md`](./ADR/README.md)

---

## 1. Estilo arquitectónico general

QUIMERA adopta una arquitectura de **Monolito Modular en Monorepo (`pnpm` workspaces) con Hexagonal Architecture (Ports & Adapters) y Pipelines Declarativos** sobre **Node.js 22+ (TypeScript ESM)** y **PostgreSQL 16+**.

### ¿Por qué NO microservicios?
El perfil de usuario de QUIMERA (desarrolladores independientes, vibe coders, agencias pequeñas, PYMEs costarricenses y runners CI) requiere:
- Instalación y ejecución en minutos con complejidad operativa mínima.
- Transacciones ACID locales entre ingestión, procedencia, conflictos, órdenes de trabajo e intenciones fiscales.
- Cero latencia ni fallos de serialización de red entre Core, Data Exodus y Pipeline cuando corren como CLI o librería embebida.

Al mismo tiempo, la separación física en **paquetes publicables independientemente** (`packages/*`) y **aplicaciones consumidoras aisladas** (`apps/*`) garantiza el desacoplamiento lógico sin pagar el costo de red distribuida.

---

## 2. Estructura del Monorepo y grafo de dependencias

```text
quimera/
├── packages/
│   ├── core/                # @quimera/core (contratos, errores, dinero exacto, puertos)
│   ├── data-exodus/         # @quimera/data-exodus (ingestión, perfilado, reconciliación, PG load)
│   ├── cr-api-passport/     # @quimera/cr-api-passport (manifiestos CR, clientes, drift, CLI/MCP)
│   ├── fiscal-outbox/       # @quimera/fiscal-outbox (PgDocumentStore, secuencias issuerId, worker)
│   ├── factura-ci/          # @quimera/factura-ci (simulador loopback, escenarios FC-*, CLI/CI)
│   ├── pipeline/            # @quimera/pipeline (motor DAG, checkpoints, compuertas humanas)
│   └── adapter-clairic/     # @quimera/adapter-clairic (OPCIONAL: StructuredExtractorPort)
├── apps/
│   ├── oficios/             # @quimera/oficios (consumidor vertical: Refrigeración/A/C, API Hono + UI)
│   └── demo-pos/            # @quimera/demo-pos (SUT sintético: modo buggy vs modo fiscal-outbox)
├── fixtures/                # Datasets sintéticos reproducibles (7 archivos / 1.000 filas, XMLs, mocks)
├── pipelines/               # Manifiestos declarativos de ejemplo (exodus-to-oficios.yaml)
└── docs/                    # Ingeniería de requisitos, arquitectura, datos, seguridad y plan
```

### Reglas estrictas de ejecución (en-proceso vs independiente)

| Modalidad de ejecución | Componentes | Razón técnica |
|---|---|---|
| **Librería en-proceso (SDK importable)** | `@quimera/core`, `@quimera/data-exodus`, `@quimera/cr-api-passport`, `@quimera/fiscal-outbox`, `@quimera/pipeline`, `@quimera/adapter-clairic` | Cero latencia IPC, composición tipada en tiempo de compilación, testeabilidad unitaria en memoria y publicación individual a npm. |
| **Proceso CLI independiente** | `quimera` (CLI unificada) + binarios independientes `quimera-exodus`, `quimera-passport`, `quimera-factura-ci`, `quimera-pipeline` | Uso directo por desarrolladores, scripts de migración, agentes IA y GitHub Actions (`--json`). |
| **Proceso Worker independiente (opcional / escalable)** | Worker de `@quimera/fiscal-outbox` (puede ejecutarse en proceso dedicado o en modo embebido de prueba) | Desacopla la latencia de red/polling de Hacienda respecto al checkout o cierre de orden en `OficiOS` / POS. |
| **Proceso HTTP independiente** | `apps/oficios` (API Hono + UI web), `apps/demo-pos` (SUT de prueba), simulador loopback de `Factura CI` | Frontera natural de usuario final y pruebas de caja negra HTTP. |
| **Servidor MCP independiente (`stdio` / HTTP stateless)** | Servidor MCP de `CR API Passport` (Should) y consultas read-only de `Data Exodus` (Post-MVP) | Exposición controlada a agentes (Claude Code / Cursor) bajo MCP `2026-07-28` sin acoplar lógica de negocio al protocolo MCP. |

---

## 3. Capas y puertos hexagonales

Cada paquete con persistencia o I/O externo sigue una división en 3 zonas internas:
1. **`domain/`:** Entidades, máquinas de estados, reglas de reconciliación, cálculos exactos (`BigInt`/decimal) y contratos puros. **Cero imports de `fs`, `pg`, `fetch` o librerías HTTP.**
2. **`ports/`:** Interfaces TypeScript que el dominio necesita (`ArtifactStorePort`, `MigrationRepositoryPort`, `FiscalOutboxStorePort`, `HttpTransportPort`, `StructuredExtractorPort`, `NotificationPort`, `ClockPort`).
3. **`adapters/`:** Implementaciones concretas (`PgMigrationRepository`, `LocalCasArtifactStore`, `PgDocumentStore`, `HaciendaSdkAdapter`, `HonoHttpAdapter`, `ClairicHttpAdapter`, `InMemory*` para pruebas).

---

## 4. Diseño del núcleo mínimo (`@quimera/core`)

Para evitar sobreingeniería, `@quimera/core` se mantiene **estrictamente minimalista** (única dependencia externa: `zod`):

### 4.1. Entidades canónicas del núcleo
- **`EntityRef`:** `{ entityType, entityId, tenantId, schemaVersion }`
- **`SourceArtifact`:** `{ id, tenantId, sha256, mimeType, originalName, sizeBytes, storageUri, ingestedAt, metadata? }`
- **`EvidenceRef`:** `{ artifactId, artifactSha256, rawRecordId, locator: { kind, sheet?, rowNumber?, xpath?, charSpan? }, capturedAt }`
- **`TransformationRecord`:** `{ id, ruleId, ruleVersion, inputRefs, outputRef, appliedAt, deterministic: boolean, aiMetadata? }`
- **`Conflict`:** `{ id, tenantId, projectId, type, severity, status, summary, evidenceRefs, proposedResolutions, createdAt }`
- **`ResolutionDecision`:** `{ id, conflictId, tenantId, action, chosenCanonicalId?, chosenValues?, actor, reason, createdAt, supersedesDecisionId? }`
- **`SchemaVersion`:** `{ schemaId, semver, jsonSchemaHash, compatibilityMode, publishedAt }`
- **`ExecutionResult<T>`:** `{ ok, runId, status, data?, warnings[], errors[], metrics: { startedAt, finishedAt, durationMs, counts } }`
- **`QuimeraError`:** `{ code, category, message, retryable, module, correlationId, details? }`

### 4.2. Metadatos obligatorios vs. opcionales
- **Obligatorios siempre:** `id` (UUIDv7 ordenable temporalmente), `tenantId`, `schemaVersion` (SemVer) y `createdAt` (ISO-8601 UTC).
- **Opcionales (nunca impuestos a módulos pequeños):** `aiMetadata` (`modelId`, `confidence`, `pNull`, `spans`), `tags`, `externalRefs`, `customAnnotations`. Así, `@quimera/cr-api-passport` puede usar `QuimeraError`, `SchemaVersion` y `ExecutionResult` sin arrastrar tablas ni conceptos de reconciliación.

---

## 5. Integración con ecosistemas externos y fronteras críticas

1. **Integración con `@dojocoding/hacienda-sdk@0.13.0`:**
   - `@quimera/data-exodus` importa únicamente `parseDocumentXml` y `verifySignedDocumentXml` para su adaptador XML FE 4.4.
   - `@quimera/fiscal-outbox` implementa `DocumentStore` del SDK sobre PostgreSQL (`PgDocumentStore`) y reutiliza `VALID_TRANSITIONS`, `classifySendResult`, `evaluateDeadline`, `buildClave`, builders XML, firma XAdES-EPES y `HttpClient` (sin `withRetry` en `POST`).
   - `@quimera/factura-ci` utiliza los validadores de esquema/clave del SDK para aserciones estructurales, mientras concentra su valor propio en **invariantes conductuales de la aplicación consumidora**.
2. **Aislamiento de `OficiOS` (`ADR-011`):**
   - `OficiOS` consume vistas/tablas migradas por `Data Exodus`, consulta CAByS/contribuyentes vía `CR API Passport` y encola intenciones vía `Fiscal Outbox`. Su dominio de órdenes de trabajo (`hvac-refrigeration-v1`) reside en `apps/oficios` y jamás entra en `@quimera/core`.
3. **Aislamiento de `Clairic` (`ADR-012`):**
   - `@quimera/adapter-clairic` implementa `StructuredExtractorPort` definido en `@quimera/core`. Ningún otro paquete lo lista en `dependencies`. Se inyecta explícitamente por configuración en tiempo de composición solo si el usuario lo instala y habilita.

---

## 6. Resumen de decisiones arquitectónicas clave (ADRs)

El razonamiento completo, alternativas evaluadas, riesgos y condiciones de revisión están registrados en [`docs/04-architecture/ADR/`](./ADR/README.md) (`ADR-001` a `ADR-015`) y resumidos en [`docs/DECISIONS.md`](../DECISIONS.md).
