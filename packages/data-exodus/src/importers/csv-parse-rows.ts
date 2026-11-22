import { parse } from "csv-parse/sync";

import type { CsvDelimiter } from "./types.js";
import type { CsvEncoding } from "./csv-decode.js";
import {
  assertSafeObjectKey,
  createSafeRecord,
  sha256SafeCanonicalJson,
} from "./safe-object.js";

/** csv-parse reconoce todos los finales de línea habituales cuando se los declara. */
const RECORD_DELIMITERS: string[] = ["\r\n", "\n", "\r"];

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

type PhysicalLine = { lineNumber: number; content: string; separator: string };
type LogicalRecord = { startLine: number; endLine: number; content: string };

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

  const logicalRecords = buildLogicalRecords(physicalLines, options.delimiter);
  let columnNames: string[] | undefined;
  const dataStartIndex = options.hasHeader ? 1 : 0;

  if (options.hasHeader && logicalRecords.length > 0) {
    columnNames = parseHeaderColumns(logicalRecords[0]!.content, options.delimiter);
  }

  const rows: ParsedCsvRow[] = [];
  let parsedOk = 0;
  let parseErrors = 0;
  let skippedEmpty = 0;

  for (let i = dataStartIndex; i < logicalRecords.length; i += 1) {
    const record = logicalRecords[i]!;
    const trimmed = record.content.trim();

    if (trimmed.length === 0) {
      const rawPayload = buildRowPayload({
        lineNumber: record.startLine,
        fields: createSafeRecord<string>(),
        rawLine: record.content,
        delimiter: options.delimiter,
        encoding: options.encoding,
      });
      rows.push({
        lineNumber: record.startLine,
        sourceLocator: `csv:line:${record.startLine}`,
        parseStatus: "SKIPPED",
        rawPayload,
        recordHash: sha256SafeCanonicalJson({
          lineNumber: record.startLine,
          parseStatus: "SKIPPED",
          rawLine: record.content,
        }),
      });
      skippedEmpty += 1;
      continue;
    }

    try {
      const parsed = parseRecord(record, columnNames, options.delimiter);
      const fields = columnsToFields(parsed.record, columnNames);
      const rawPayload = buildRowPayload({
        lineNumber: parsed.lineNumber,
        fields,
        rawLine: record.content,
        delimiter: options.delimiter,
        encoding: options.encoding,
      });

      rows.push({
        lineNumber: parsed.lineNumber,
        sourceLocator: `csv:line:${parsed.lineNumber}`,
        parseStatus: "OK",
        rawPayload,
        recordHash: sha256SafeCanonicalJson(rawPayload),
      });
      parsedOk += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const rawPayload = buildRowPayload({
        lineNumber: record.startLine,
        fields: createSafeRecord<string>(),
        rawLine: record.content,
        delimiter: options.delimiter,
        encoding: options.encoding,
        parseError: message,
      });
      rows.push({
        lineNumber: record.startLine,
        sourceLocator: `csv:line:${record.startLine}`,
        parseStatus: "ERROR",
        parseError: message,
        rawPayload,
        recordHash: sha256SafeCanonicalJson({
          lineNumber: record.startLine,
          parseStatus: "ERROR",
          rawLine: record.content,
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

/**
 * Divide el texto en líneas físicas conservando su separador para poder
 * reconstruir el `rawLine` original de un registro multilínea entre comillas.
 */
function splitPhysicalLines(text: string): PhysicalLine[] {
  const lines: PhysicalLine[] = [];
  const separator = /\r\n|\n|\r/g;
  let start = 0;
  let lineNumber = 1;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(text)) !== null) {
    lines.push({
      lineNumber,
      content: text.slice(start, match.index),
      separator: match[0],
    });
    start = match.index + match[0].length;
    lineNumber += 1;
  }
  if (start < text.length) {
    lines.push({ lineNumber, content: text.slice(start), separator: "" });
  }
  return lines;
}

/** Cuenta los separadores de línea con escape de comillas dobles (`""`). */
function quoteStateForLine(line: string, initialInQuotes: boolean): boolean {
  let inQuotes = initialInQuotes;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== '"') {
      continue;
    }
    if (line[i + 1] === '"') {
      i += 1;
      continue;
    }
    inQuotes = !inQuotes;
  }
  return inQuotes;
}

/**
 * Agrupa líneas físicas en registros lógicos. Una comilla sin cerrar al final
 * del archivo no debe fagocitar las líneas posteriores: en ese caso cada línea
 * se vuelve a tratar como registro independiente (y se reporta como ERROR).
 */
function looksLikeRecordStart(line: PhysicalLine, delimiter: CsvDelimiter): boolean {
  const index = line.content.indexOf(delimiter);
  if (index <= 0) {
    return false;
  }
  const after = line.content[index + delimiter.length] ?? "";
  return after.length > 0 && after !== " " && after !== "\t";
}

function buildLogicalRecords(
  lines: PhysicalLine[],
  delimiter: CsvDelimiter,
): LogicalRecord[] {
  const groups: PhysicalLine[][] = [];
  let buffer: PhysicalLine[] = [];
  let inQuotes = false;

  const flushBufferAsBroken = () => {
    for (const line of buffer) {
      groups.push([line]);
    }
    buffer = [];
    inQuotes = false;
  };

  for (const line of lines) {
    // Una línea con pinta de registro nuevo nunca es continuación de un campo
    // entre comillas: evita que una comilla sin cerrar trague las siguientes.
    if (inQuotes && looksLikeRecordStart(line, delimiter)) {
      flushBufferAsBroken();
    }
    buffer.push(line);
    inQuotes = quoteStateForLine(line.content, inQuotes);
    if (!inQuotes) {
      groups.push(buffer);
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    for (const line of buffer) {
      groups.push([line]);
    }
  }

  return groups.map((group) => ({
    startLine: group[0]!.lineNumber,
    endLine: group[group.length - 1]!.lineNumber,
    content: group
      .map((line, index) =>
        index < group.length - 1 ? `${line.content}${line.separator}` : line.content,
      )
      .join(""),
  }));
}

type CsvParseRecord = {
  record: Array<Record<string, string> | string[]>;
  info: { lines: number };
};

function parseRecord(
  logical: LogicalRecord,
  columnNames: string[] | undefined,
  delimiter: CsvDelimiter,
): { lineNumber: number; record: Record<string, string> | string[] } {
  const parsed = parse(logical.content, {
    delimiter,
    record_delimiter: RECORD_DELIMITERS,
    info: true,
    relax_column_count: true,
    relax_quotes: false,
    skip_empty_lines: false,
    columns: columnNames ?? false,
    trim: false,
  }) as unknown as CsvParseRecord[];

  const first = parsed[0];
  if (!first) {
    throw new Error("empty parse result");
  }
  // `info` expone el número de línea de csv-parse; se usa para validar que el
  // registro lógico se haya consumido por completo (incluidos sus saltos).
  if (!Number.isInteger(first.info.lines) || first.info.lines < 1) {
    throw new Error("invalid csv-parse info.lines");
  }
  const lineNumber = logical.startLine;
  const raw = first.record as unknown;
  return { lineNumber, record: raw as Record<string, string> | string[] };
}

function parseHeaderColumns(headerContent: string, delimiter: CsvDelimiter): string[] {
  const parsed = parse(headerContent, {
    delimiter,
    record_delimiter: RECORD_DELIMITERS,
    info: true,
    relax_column_count: true,
    relax_quotes: false,
    skip_empty_lines: false,
    trim: true,
  }) as unknown as CsvParseRecord[];
  const raw = parsed[0]?.record as unknown;
  const cells = Array.isArray(raw)
    ? raw
    : Object.values((raw ?? {}) as Record<string, string>);
  return cells.map((cell, index) => {
    const label = String(cell ?? "").trim();
    if (label.length === 0) {
      return `col_${index}`;
    }
    // Un encabezado `__proto__` se rechaza: usarlo como clave alteraría el
    // prototipo de cada objeto de campos generado a partir del archivo.
    assertSafeObjectKey(label);
    return label;
  });
}

function columnsToFields(
  record: Record<string, string> | string[],
  columnNames: string[] | undefined,
): Record<string, string> {
  const fields = createSafeRecord<string>();
  if (Array.isArray(record)) {
    for (let i = 0; i < record.length; i += 1) {
      const key = columnNames?.[i] ?? `col_${i}`;
      assertSafeObjectKey(key);
      fields[key] = record[i] ?? "";
    }
    return fields;
  }
  for (const [key, value] of Object.entries(record)) {
    assertSafeObjectKey(key);
    fields[key] = value ?? "";
  }
  return fields;
}

function buildRowPayload(input: {
  lineNumber: number;
  fields: Record<string, string>;
  rawLine: string;
  delimiter: CsvDelimiter;
  encoding: CsvEncoding;
  parseError?: string;
}): Record<string, unknown> {
  const payload = createSafeRecord<unknown>();
  payload.rowNumber = input.lineNumber;
  payload.fields = input.fields;
  payload.rawLine = input.rawLine;
  payload.delimiter = input.delimiter;
  payload.encoding = input.encoding;
  if (input.parseError) {
    payload.parseError = input.parseError;
  }
  return payload;
}
