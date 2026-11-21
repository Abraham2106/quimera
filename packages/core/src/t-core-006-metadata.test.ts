import { describe, expect, it } from "vitest";
import { MinimalRecordSchema, NormalizedEntitySchema } from "./index.js";

describe("T-CORE-006 — metadatos obligatorios vs opcionales", () => {
  it("acepta registro mínimo sin campos opcionales", () => {
    expect(
      MinimalRecordSchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000001",
        tenantId: "018f4e7a-90e0-7000-8000-000000000010",
        schemaVersion: "1.0.0",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeTruthy();
    expect(
      NormalizedEntitySchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000002",
        tenantId: "018f4e7a-90e0-7000-8000-000000000010",
        schemaVersionId: "018f4e7a-90e0-7000-8000-000000000011",
        entityType: "customer",
        naturalKey: "k1",
        status: "DRAFT",
        canonicalData: {},
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeTruthy();
  });

  it("rechaza sin tenantId", () => {
    expect(() =>
      MinimalRecordSchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000001",
        schemaVersion: "1.0.0",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      NormalizedEntitySchema.parse({
        id: "018f4e7a-90e0-7000-8000-000000000002",
        schemaVersionId: "018f4e7a-90e0-7000-8000-000000000011",
        entityType: "customer",
        naturalKey: "k1",
        status: "DRAFT",
        canonicalData: {},
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("acepta opcionales tags/aiMetadata/customAnnotations", () => {
    const parsed = NormalizedEntitySchema.parse({
      id: "018f4e7a-90e0-7000-8000-000000000002",
      tenantId: "018f4e7a-90e0-7000-8000-000000000010",
      schemaVersionId: "018f4e7a-90e0-7000-8000-000000000011",
      entityType: "customer",
      naturalKey: "k1",
      status: "DRAFT",
      canonicalData: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      tags: ["demo"],
      aiMetadata: { confidence: 0.9 },
      customAnnotations: { note: "x" },
    });
    expect(parsed.tags).toEqual(["demo"]);
  });
});