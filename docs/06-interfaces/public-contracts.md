# Contratos Públicos e Internos — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [ADR-007](../04-architecture/ADR/ADR-007-intermodule-contracts.md) | [Política de Versionado](./versioning-policy.md) | [JSON Schema de ejemplo](./contracts/core-contracts.schema.json)

---

## 1. Matriz de Interfaces Públicas por Módulo

No todos los módulos exponen todas las interfaces (`ADR-009`, principio de superficie mínima).

| Módulo | SDK TS | CLI (`--json`) | API HTTP | MCP | Pipeline declarativo |
|---|---|---|---|---|---|
| `@quimera/core` | **Sí (Primaria)** | No | No | No | Define contratos |
| `@quimera/data-exodus` | **Sí** | **Sí (`quimera exodus`)** | Opcional (post-MVP) | Solo lectura (post-MVP) | Pasos `exodus.*` |
| `@quimera/cr-api-passport` | **Sí** | **Sí (`quimera passport`)** | Opcional (Workers beta) | **Sí (Should, read-only/verify)** | Pasos `passport.*` |
| `@quimera/fiscal-outbox` | **Sí** | Operación/inspección (`quimera outbox`) | No (embebido en app) | **Prohibido** (seguridad fiscal) | Post-MVP |
| `@quimera/factura-ci` | **Sí** | **Sí (`quimera factura-ci`)** | Simulador loopback interno | Post-MVP (ejecución solo lectura) | Paso CI / GitHub Action |
| `@quimera/pipeline` | **Sí** | **Sí (`quimera pipeline`)** | No | No | **Motor ejecutor** |
| `@quimera/adapter-clairic` | **Sí (Opcional)** | No | No | No | Paso opcional `clairic.extract` |
| `apps/oficios` | No (consumidor) | Seed/admin | **Sí (Hono REST)** + UI Web | No | Consumidor de destino |

---

## 2. Contratos Internos Canónicos (`@quimera/core`)

Todos los contratos se implementan en **Zod v4** y se exportan a **JSON Schema Draft 2020-12** (`docs/06-interfaces/contracts/core-contracts.schema.json`).

### 2.1. Identidad y Metadatos Base

```typescript
export interface QuimeraEnvelope<T> {
  contractVersion: `${number}.${number}.${number}`; // ej. "1.0.0"
  tenantId: string; // UUIDv7
  correlationId: string; // UUIDv7
  producedAt: string; // ISO-8601 UTC
  producer: {
    module: string; // ej. "@quimera/data-exodus"
    version: string;
  };
  payload: T;
}
```

### 2.2. Registro Crudo y Evidencia (`RawRecord`, `EvidenceArtifact`)

```typescript
export type ArtifactKind =
  | 'source_file'
  | 'fe_xml_unsigned'
  | 'fe_xml_signed'
  | 'hacienda_response'
  | 'work_order_photo'
  | 'approval_proof'
  | 'reconciliation_report';

export interface EvidenceArtifact {
  id: string;
  tenantId: string;
  sha256: string; // hex 64 chars
  artifactKind: ArtifactKind;
  originalName: string;
  mimeType: string;
  byteSize: number;
  storageUri: string; // ej. "cas://sha256/ab/cd/abcdef..."
  ingestedAt: string;
}

export interface RawRecord {
  id: string;
  tenantId: string;
  batchId: string;
  artifactId: string;
  sourceLocator: string; // ej. "xlsx:Clientes!row:42"
  recordHash: string;
  rawPayload: Record<string, unknown>;
  parseStatus: 'OK' | 'ERROR' | 'SKIPPED';
  parseError?: string;
}
```

### 2.3. Transformación y Procedencia (`ProvenanceEntry`)

```typescript
export type OriginKind =
  | 'DIRECT_PARSE'
  | 'RULE_TRANSFORM'
  | 'HUMAN_DECISION'
  | 'EXTERNAL_API'
  | 'AI_EXTRACTION';

export interface ProvenanceEntry {
  id: string;
  tenantId: string;
  entityId: string;
  fieldPath: string; // "*" o JSON Pointer ej. "/taxId"
  rawRecordId?: string;
  artifactId: string;
  schemaVersionId: string;
  decisionId?: string;
  originKind: OriginKind;
  transformationId: string;
  ruleVersion: string;
  metadata?: {
    confidence?: number; // obligatorio si originKind === 'AI_EXTRACTION'
    pNull?: number;
    valid?: boolean;
    complete?: boolean;
    charSpans?: Array<[number, number]>;
    passportId?: string;
    passportVersion?: string;
  };
  createdAt: string;
}
```

### 2.4. Conflictos y Decisiones (`Conflict`, `ResolutionDecision`)

```typescript
export type ConflictCode =
  | 'EXACT_DUPLICATE'
  | 'PROBABLE_DUPLICATE'
  | 'CONFLICTING_IDENTITY'
  | 'MONETARY_MISMATCH'
  | 'MISSING_REQUIRED_DATA'
  | 'ORPHAN_RECORD'
  | 'INVALID_REFERENCE'
  | 'TEMPORAL_ANOMALY'
  | 'UNIT_OR_CURRENCY_MISMATCH'
  | 'UNRECONCILABLE_BALANCE'
  | 'AI_LOW_CONFIDENCE';

export type ConflictSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

export interface Conflict {
  id: string;
  tenantId: string;
  batchId?: string;
  conflictCode: ConflictCode;
  severity: ConflictSeverity;
  status: 'OPEN' | 'RESOLVED' | 'DEFERRED' | 'UNRECONCILABLE';
  candidateEntityIds: string[];
  evidenceRefs: Array<{ artifactId: string; sourceLocator: string }>;
  summary: string;
  detectedAt: string;
}

export interface ResolutionDecision {
  id: string;
  tenantId: string;
  conflictId: string;
  action: 'MERGE' | 'KEEP_SEPARATE' | 'OVERRIDE_FIELD' | 'REJECT_RECORD' | 'MARK_UNRECONCILABLE' | 'DEFER';
  actorType: 'RULE' | 'HUMAN';
  actorId: string;
  rationale: string;
  payload: Record<string, unknown>;
  supersedesDecisionId?: string;
  decidedAt: string;
}
```

### 2.5. Resultados, Errores y Operaciones Asíncronas

```typescript
export interface QuimeraError {
  code: `ERR_${string}`; // ej. "ERR_DATA_COUNT_MISMATCH", "ERR_PASS_RATE_LIMITED", "ERR_FISCAL_UNCERTAIN"
  category: 'VALIDATION' | 'CONTRACT' | 'CONFLICT' | 'EXTERNAL_API' | 'SECURITY' | 'STORAGE' | 'FISCAL' | 'INTERNAL';
  message: string;
  retryable: boolean;
  requiresHumanReview?: boolean;
  details?: Record<string, unknown>;
  correlationId: string;
}

export interface QuimeraWarning {
  code: `W_${string}`;
  message: string;
  context?: Record<string, unknown>;
}

export type OperationResult<T> =
  | { ok: true; data: T; warnings: QuimeraWarning[]; metrics?: ExecutionMetrics }
  | { ok: false; error: QuimeraError; warnings: QuimeraWarning[]; metrics?: ExecutionMetrics };

export interface AsyncOperationHandle {
  operationId: string;
  status: 'PENDING' | 'RUNNING' | 'WAITING_FOR_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress?: { completed: number; total?: number };
  checkpointStepId?: string;
  pollAfterMs?: number;
}
```

### 2.6. Contrato de Ejecución de Módulo / Paso (`PipelineStepPort`)

```typescript
export interface ModuleCapabilities {
  module: string;
  version: string;
  contractVersion: string;
  requiresAi: false | 'optional';
  supportsOffline: boolean;
  steps: Array<{
    stepId: string;
    inputContract: string;
    outputContract: string;
    idempotent: boolean;
    supportsHumanGate: boolean;
  }>;
}

export interface PipelineStepPort<TInput, TOutput> {
  readonly stepId: string;
  readonly inputContract: string;
  readonly outputContract: string;
  readonly idempotent: boolean;
  execute(ctx: StepContext, input: TInput): Promise<OperationResult<TOutput>>;
  compensate?(ctx: StepContext, output: TOutput): Promise<OperationResult<void>>;
}
```

### 2.7. Puerto Opcional de Extracción Estructurada (`StructuredExtractorPort`)

```typescript
export interface StructuredExtractorPort {
  readonly providerId: string; // ej. "cloudflare-clairic"
  extract<T>(request: {
    schema: Record<string, unknown>; // JSON Schema
    text?: string;
    images?: Array<{ mimeType: 'image/jpeg' | 'image/png' | 'application/pdf'; bytes: Uint8Array }>;
  }): Promise<OperationResult<{
    value: T;
    fields: Record<string, {
      confidence: number;
      pNull: number;
      valid: boolean;
      complete: boolean;
      spans?: Array<[number, number]>;
    }>;
  }>>;
}
```

---

## 3. Contratos de Ejemplo Incluidos en el Repositorio

- `docs/06-interfaces/contracts/core-contracts.schema.json` — Esquema JSON Schema Draft 2020-12 de `EvidenceArtifact`, `Conflict`, `ResolutionDecision` y `QuimeraError`.
- `docs/06-interfaces/contracts/passport-hacienda-cabys.yaml` — Manifiesto completo del pasaporte `cr.hacienda.cabys`.
- `docs/06-interfaces/contracts/pipeline-exodus-oficios.yaml` — Manifiesto declarativo DAG de migración hacia OficiOS.
