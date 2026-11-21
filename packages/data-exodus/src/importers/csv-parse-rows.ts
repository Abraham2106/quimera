import { parse } from "csv-parse/sync";
import { canonicalizeJsonValue, sha256CanonicalJson } from "@quimera/core";

import type { CsvDelimiter } from "./types.js";
import type { CsvEncoding } from "./csv-decode.js";

export type ParsedCsvRow = {
  lineNumber: number;
  sourceLocator: string;
  parseStatus: "OK" | "ERROR" | "SKIPPED";
  parseError?: string;
  rawPayload: Record<string, unknown>;
  recordHash: string;
};

export type CsvRowCounts = {
  totalRowsSeen: number;
  parsedOk: number;
  parseErrors: number;
  skippedEmpty: number;
};

export function parseCsvRows(
  text: string,
  options: {
    delimiter: CsvDelimiter;
    hasHeader: boolean;
    encoding: CsvEncoding;
  },
): { rows: ParsedCsvRow[]; counts: CsvRowCounts } {
  const physicalLines = splitPhysicalLines(text);
  if (physicalLines.length === 0) {
    return {
      rows: [],
      counts: {
        totalRowsSeen: 0,
        parsedOk: 0,
        parseErrors: 0,
        skippedEmpty: 0,
      },
    };
  }

  let columnNames: string[] | undefined;
  const dataStartIndex = options.hasHeader ? 1 : 0;

  if (options.hasHeader && physicalLines.length > 0) {
    columnNames = parseHeaderColumns(physicalLines[0]!.content, options.delimiter);
  }

  const rows: ParsedCsvRow[] = [];
  let parsedOk = 0;
  let parseErrors = 0;
  let skippedEmpty = 0;

  for (let i = dataStartIndex; i < physicalLines.length; i += 1) {
    const { lineNumber, content } = physicalLines[i]!;
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      const rawPayload = buildRowPayload({
        lineNumber,
        fields: {},
        rawLine: content,
        delimiter: options.delimiter,
        encoding: options.encoding,
      });
      rows.push({
        lineNumber,
        sourceLocator: `csv:line:${lineNumber}`,
        parseStatus: "SKIPPED",
        rawPayload,
        recordHash: sha256CanonicalJson({
          lineNumber,
          parseStatus: "SKIPPED",
          rawLine: content,
        }),
      });
      skippedEmpty += 1;
      continue;
    }

    try {
      const parsed = parse(content, {
        delimiter: options.delimiter,
        relax_column_count: true,
        relax_quotes: false,
        skip_empty_lines: false,
        columns: columnNames ?? false,
        trim: false,
      }) as Array<Record<string, string> | string[]>;

      if (parsed.length === 0) {
        throw new Error("empty parse result");
      }

      const fields = columnsToFields(parsed[0]!, columnNames);
      const rawPayload = buildRowPayload({
        lineNumber,
        fields,
        rawLine: content,
        delimiter: options.delimiter,
        encoding: options.encoding,
      });

      rows.push({
        lineNumber,
        sourceLocator: `csv:line:${lineNumber}`,
        parseStatus: "OK",
        rawPayload,
        recordHash: sha256CanonicalJson(canonicalizeJsonValue(rawPayload)),
      });
      parsedOk += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const rawPayload = buildRowPayload({
        lineNumber,
        fields: {},
        rawLine: content,
        delimiter: options.delimiter,
        encoding: options.encoding,
        parseError: message,
      });
      rows.push({
        lineNumber,
        sourceLocator: `csv:line:${lineNumber}`,
        parseStatus: "ERROR",
        parseError: message,
        rawPayload,
        recordHash: sha256CanonicalJson({
          lineNumber,
          parseStatus: "ERROR",
          rawLine: content,
        }),
      });
      parseErrors += 1;
    }
  }

  const totalRowsSeen = rows.length;
  assertCountInvariant(totalRowsSeen, parsedOk, parseErrors, skippedEmpty);

  return {
    rows,
    counts: { totalRowsSeen, parsedOk, parseErrors, skippedEmpty },
  };
}

export function assertCountInvariant(
  totalRowsSeen: number,
  parsedOk: number,
  parseErrors: number,
  skippedEmpty: number,
): void {
  if (totalRowsSeen !== parsedOk + parseErrors + skippedEmpty) {
    throw new Error(
      `ERR_DATA_COUNT_MISMATCH: ${totalRowsSeen} !== ${parsedOk}+${parseErrors}+${skippedEmpty}`,
    );
  }
}

function splitPhysicalLines(text: string): Array<{ lineNumber: number; content: string }> {
  const parts = text.split(/\r?\n/);
  if (parts.length > 0 && parts[parts.length - 1] === "" && text.endsWith("\n")) {
    parts.pop();
  }
  return parts.map((content, index) => ({
    lineNumber: index + 1,
    content,
  }));
}

function parseHeaderColumns(headerLine: string, delimiter: CsvDelimiter): string[] {
  const parsed = parse(headerLine, {
    delimiter,
    relax_column_count: true,
    relax_quotes: false,
    skip_empty_lines: false,
    trim: true,
  }) as string[][];
  const row = parsed[0] ?? [];
  return row.map((cell, index) => {
    const label = (cell ?? "").trim();
    return label.length > 0 ? label : `col_${index}`;
  });
}

function columnsToFields(
  record: Record<string, string> | string[],
  columnNames: string[] | undefined,
): Record<string, string> {
  if (Array.isArray(record)) {
    const fields: Record<string, string> = {};
    for (let i = 0; i < record.length; i += 1) {
      const key = columnNames?.[i] ?? `col_${i}`;
      fields[key] = record[i] ?? "";
    }
    return fields;
  }
  return { ...record };
}

function buildRowPayload(input: {
  lineNumber: number;
  fields: Record<string, string>;
  rawLine: string;
  delimiter: CsvDelimiter;
  encoding: CsvEncoding;
  parseError?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    rowNumber: input.lineNumber,
    fields: input.fields,
    rawLine: input.rawLine,
    delimiter: input.delimiter,
    encoding: input.encoding,
  };
  if (input.parseError) {
    payload.parseError = input.parseError;
  }
  return payload;
}