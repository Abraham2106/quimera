import type { OperationResult } from "@quimera/core";

export type CsvDelimiter = "," | ";" | "\t";

export type ImportCounts = {
  totalRowsSeen: number;
  parsedOk: number;
  parseErrors: number;
  skippedEmpty: number;
  inserted: number;
};

export type SourceImportSummary = {
  batchId: string;
  artifactId: string;
  artifactSha256: string;
  counts: ImportCounts;
  idempotentReplay: boolean;
};

export type SourceImportRequest = {
  tenantId: string;
  sourceId: string;
  schemaVersionId: string;
  filePath: string;
  originalName?: string;
};

export type CsvImportRequest = SourceImportRequest & {
  delimiter?: CsvDelimiter;
  hasHeader?: boolean;
};

export interface SourceImporterPort {
  readonly kind: string;
  import(
    request: SourceImportRequest,
  ): Promise<OperationResult<SourceImportSummary>>;
}