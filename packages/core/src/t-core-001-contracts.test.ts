import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsPlugin from "ajv-formats";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import {
  ConflictSchema,
  EvidenceArtifactSchema,
  ExecutionResultSchema,
  NormalizedEntitySchema,
  QuimeraErrorSchema,
  RawRecordSchema,
  ResolutionDecisionSchema,
  SchemaVersionSchema,
  SourceArtifactSchema,
  TransformationRecordSchema,
  EvidenceRefSchema,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "../schemas/core-contracts.schema.json");

const sampleArtifact = {
  id: "018f4e7a-90e0-7000-8000-000000000001",
  tenantId: "018f4e7a-90e0-7000-8000-000000000010",
  sha256: "a".repeat(64),
  artifactKind: "source_file" as const,
  originalName: "clientes.csv",
  mimeType: "text/csv",
  byteSize: 12,
  storageUri: "cas://sha256/ab/abcd",
  ingestedAt: "2026-01-01T00:00:00.000Z",
};

describe("T-CORE-001 — contratos Zod y JSON Schema", () => {
  it("valida tipos canónicos con Zod", () => {
    expect(EvidenceArtifactSchema.parse(sampleArtifact)).toEqual(sampleArtifact);
    expect(SourceArtifactSchema.parse(sampleArtifact)).toEqual(sampleArtifact);
    expect(
      RawRecordSchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000002",
        tenantId: sampleArtifact.tenantId,
        batchId: "018f4e7a-90e0-7000-8000-000000000003",
        artifactId: sampleArtifact.id,
        sourceLocator: "csv:row:2",
        recordHash: "b".repeat(64),
        rawPayload: { name: "ACME" },
        parseStatus: "OK",
      }),
    ).toBeTruthy();
    expect(
      NormalizedEntitySchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000004",
        tenantId: sampleArtifact.tenantId,
        schemaVersionId: "018f4e7a-90e0-7000-8000-000000000005",
        entityType: "customer",
        naturalKey: "ACME",
        status: "DRAFT",
        canonicalData: { name: "ACME" },
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeTruthy();
    expect(
      ConflictSchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000006",
        tenantId: sampleArtifact.tenantId,
        conflictCode: "EXACT_DUPLICATE",
        severity: "WARNING",
        status: "OPEN",
        candidateEntityIds: ["018f4e7a-90e0-7000-8000-000000000004"],
        evidenceRefs: [{ artifactId: sampleArtifact.id, sourceLocator: "csv:row:2" }],
        summary: "duplicate customer",
        detectedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeTruthy();
    expect(
      ResolutionDecisionSchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000007",
        tenantId: sampleArtifact.tenantId,
        conflictId: "018f4e7a-90e0-7000-8000-000000000006",
        action: "MERGE",
        actorType: "HUMAN",
        actorId: "user-1",
        rationale: "same tax id",
        payload: {},
        decidedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeTruthy();
    expect(
      SchemaVersionSchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000008",
        schemaId: "exodus-canonical",
        semver: "1.0.0",
        jsonSchemaHash: "c".repeat(64),
        compatibilityMode: "BACKWARD",
        publishedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeTruthy();
    expect(
      ExecutionResultSchema.parse({
        status: "COMPLETED",
        metrics: { durationMs: 10, counts: { rows: 1 } },
      }),
    ).toBeTruthy();
    expect(
      QuimeraErrorSchema.parse({
        code: "ERR_VALIDATION",
        category: "VALIDATION",
        message: "bad field",
        retryable: false,
        correlationId: sampleArtifact.tenantId,
        module: "@quimera/core",
      }),
    ).toBeTruthy();
    expect(
      EvidenceRefSchema.parse({
        artifactId: sampleArtifact.id,
        locator: { kind: "csv", rowNumber: 2 },
        capturedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeTruthy();
    expect(
      TransformationRecordSchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000009",
        tenantId: sampleArtifact.tenantId,
        ruleId: "map-customer",
        ruleVersion: "1.0.0",
        inputRefs: [
          {
            artifactId: sampleArtifact.id,
            locator: { kind: "csv", rowNumber: 2 },
            capturedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        outputRef: {
          artifactId: sampleArtifact.id,
          locator: { kind: "entity", rowNumber: 1 },
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
        appliedAt: "2026-01-01T00:00:00.000Z",
        deterministic: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeTruthy();
  });

  it("el JSON Schema exportado valida instancias de muestra", async () => {
    const raw = await readFile(schemaPath, "utf8");
    const schema = JSON.parse(raw) as Record<string, unknown>;
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    (addFormatsPlugin as unknown as (instance: Ajv2020) => Ajv2020)(ajv);

    const defs = schema.$defs as Record<string, AnySchema>;
    const validateArtifact = ajv.compile(defs.EvidenceArtifact!);
    expect(validateArtifact(sampleArtifact)).toBe(true);

    const errSample = {
      code: "ERR_VALIDATION",
      category: "VALIDATION",
      message: "bad field",
      retryable: false,
      correlationId: sampleArtifact.tenantId,
      module: "@quimera/core",
    };
    const validateError = ajv.compile(defs.QuimeraError!);
    expect(validateError(errSample)).toBe(true);

    expect(defs.EvidenceArtifact).toBeDefined();
    expect(defs.Conflict).toBeDefined();
    expect(defs.ResolutionDecision).toBeDefined();
    expect(defs.QuimeraError).toBeDefined();
  });
});