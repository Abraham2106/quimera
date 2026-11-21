import type { OperationResult } from "../schemas/operations.js";

export interface StructuredExtractorImageInput {
  readonly mimeType: "image/jpeg" | "image/png" | "application/pdf";
  readonly bytes: Uint8Array;
}

export interface StructuredExtractorFieldMeta {
  readonly confidence: number;
  readonly pNull: number;
  readonly valid: boolean;
  readonly complete: boolean;
  readonly spans?: Array<[number, number]>;
}

export interface StructuredExtractorPort {
  readonly providerId: string;
  extract<T>(request: {
    readonly schema: Record<string, unknown>;
    readonly text?: string;
    readonly images?: readonly StructuredExtractorImageInput[];
  }): Promise<
    OperationResult<{
      readonly value: T;
      readonly fields: Record<string, StructuredExtractorFieldMeta>;
    }>
  >;
}