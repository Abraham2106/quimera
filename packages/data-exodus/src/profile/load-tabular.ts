import fs from "node:fs/promises";
import path from "node:path";
import { Buffer as NodeBuffer } from "node:buffer";
import ExcelJS from "exceljs";

import { decodeCsvBytes, detectDelimiter } from "../importers/csv-decode.js";
import { parseCsvRows } from "../importers/csv-parse-rows.js";
import { parseXlsxWorkbook } from "../importers/xlsx.js";
import type { TabularSource } from "./types.js";

function fieldsOf(rawPayload: Record<string, unknown>): Record<string, string> {
  const fields = rawPayload.fields;
  if (!fields || typeof fields !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    out[key] = value === null || value === undefined ? "" : String(value);
  }
  return out;
}

async function loadCsv(filePath: string, sourceId: string): Promise<TabularSource> {
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const decoded = decodeCsvBytes(bytes);
  const delimiter = detectDelimiter(decoded.text);
  const parsed = parseCsvRows(decoded.text, {
    delimiter,
    hasHeader: true,
    encoding: decoded.encoding,
  });
  const rows = parsed.rows
    .filter((row) => row.parseStatus === "OK")
    .map((row) => fieldsOf(row.rawPayload));
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { sourceId, columns, rows };
}

async function loadXlsx(filePath: string, sourceId: string): Promise<TabularSource> {
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(NodeBuffer.from(bytes) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  const parsed = parseXlsxWorkbook(workbook, { hasHeader: true });
  const rows = parsed.rows
    .filter((row) => row.parseStatus === "OK")
    .map((row) => fieldsOf(row.rawPayload));
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { sourceId, columns, rows };
}

function localTagRows(xml: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const documents = xml.split(/<(?:[\w-]+:)?FacturaElectronica\b/i).slice(1);
  const chunks = documents.length > 0 ? documents : [xml];
  for (const chunk of chunks) {
    const row: Record<string, string> = {};
    const pattern = /<([\w-]+(?:[:][\w-]+)?)>([^<]*)<\/\1>/g;
    for (const match of chunk.matchAll(pattern)) {
      const rawName = match[1] ?? "";
      const local = rawName.includes(":") ? rawName.slice(rawName.indexOf(":") + 1) : rawName;
      const value = (match[2] ?? "").trim();
      if (!value || local === "FacturaElectronica") continue;
      row[local] = value;
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return rows;
}

async function loadXmlDir(dir: string, sourceId: string): Promise<TabularSource> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((name) => name.toLowerCase().endsWith(".xml")).sort();
  } catch {
    return { sourceId, columns: [], rows: [] };
  }
  const rows: Record<string, string>[] = [];
  for (const name of names) {
    const xml = await fs.readFile(path.join(dir, name), "utf8");
    rows.push(...localTagRows(xml));
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  return { sourceId, columns, rows };
}

export async function loadDemoHvacTabularSources(rootDir: string): Promise<TabularSource[]> {
  const csvNames = ["ventas_2025.csv", "pagos.csv", "inventario.csv", "equipos_hvac.csv", "notas.csv"];
  const sources: TabularSource[] = [];
  for (const name of csvNames) {
    sources.push(await loadCsv(path.join(rootDir, name), name));
  }
  sources.push(await loadXlsx(path.join(rootDir, "clientes.xlsx"), "clientes.xlsx"));
  sources.push(await loadXmlDir(path.join(rootDir, "fe"), "fe"));
  return sources;
}
