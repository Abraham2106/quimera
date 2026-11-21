import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Buffer as NodeBuffer } from "node:buffer";
import ExcelJS from "exceljs";
import { sha256CanonicalJson } from "@quimera/core";

import { decodeCsvBytes, detectDelimiter } from "../importers/csv-decode.js";
import { parseCsvRows } from "../importers/csv-parse-rows.js";
import { parseXlsxWorkbook } from "../importers/xlsx.js";
import { assertFeXmlSafeForParsing } from "../importers/fe-xml.js";
import {
  reconcileDetect,
  type BalanceDeclaration,
  type NormalizedClient,
  type NormalizedInvoice,
  type NormalizedPayment,
  type ProvenanceEntry,
  type ReconcileDataset,
  type ReconcileResult,
} from "../reconcile/index.js";
import { parseCrcMinor } from "./parse-crc-minor.js";

const DEMO_HVAC_ARTIFACT_NS = "22222222-2222-4222-8222";

function artifactIdForFile(relativePath: string): string {
  const hex = createHash("sha256")
    .update(`demo-hvac-1000:${relativePath}`)
    .digest("hex");
  return `${DEMO_HVAC_ARTIFACT_NS.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function prov(artifactId: string, sourceLocator: string): ProvenanceEntry[] {
  return [{ artifactId, sourceLocator }];
}

function fieldStr(fields: Record<string, unknown>, key: string): string {
  const v = fields[key];
  if (v === null || v === undefined) {
    return "";
  }
  return String(v).trim();
}

function clientIdForRow(identificacion: string, rowNumber: number): string {
  const digits = identificacion.replace(/\D/g, "");
  if (digits === "9001000200") {
    return "client-anchor";
  }
  return `client-xlsx-${rowNumber}`;
}

function invoiceRecordHash(invoiceNumber: string, amountMinor: bigint, currency: string): string {
  return sha256CanonicalJson({
    kind: "venta_crc",
    invoiceNumber: invoiceNumber.trim(),
    amountMinor: amountMinor.toString(),
    currency,
  });
}

export type LoadDemoHvac1000Result = {
  dataset: ReconcileDataset;
  rowCount: number;
  reconcile: ReconcileResult;
};

async function countFeXmlDocuments(rootDir: string): Promise<number> {
  const feDir = path.join(rootDir, "fe");
  let entries: string[];
  try {
    entries = await fs.readdir(feDir);
  } catch {
    return 0;
  }
  let count = 0;
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".xml")) {
      continue;
    }
    const filePath = path.join(feDir, name);
    const text = await fs.readFile(filePath, "utf8");
    try {
      assertFeXmlSafeForParsing(text);
    } catch {
      continue;
    }
    count += 1;
  }
  return count;
}

async function loadClientsFromXlsx(rootDir: string): Promise<{
  clients: NormalizedClient[];
  balances: BalanceDeclaration[];
  rowCount: number;
}> {
  const filePath = path.join(rootDir, "clientes.xlsx");
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    NodeBuffer.from(bytes) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0],
  );

  const artifactId = artifactIdForFile("clientes.xlsx");
  const { rows } = parseXlsxWorkbook(workbook, {
    sheets: ["Clientes"],
    hasHeader: true,
  });

  const clients: NormalizedClient[] = [];
  for (const row of rows) {
    if (row.parseStatus !== "OK") {
      continue;
    }
    const fields = (row.rawPayload.fields ?? {}) as Record<string, unknown>;
    const identificacion = fieldStr(fields, "identificacion");
    const razon = fieldStr(fields, "razon_social");
    if (!identificacion || !razon) {
      continue;
    }
    const id = clientIdForRow(identificacion, row.rowNumber);
    clients.push({
      id,
      legalName: razon,
      taxId: identificacion,
      provenance: prov(artifactId, `clientes.xlsx#${row.rowNumber}`),
    });
  }

  const balances: BalanceDeclaration[] = [];
  const clientIds = new Map<string, string>();
  for (const c of clients) {
    const digits = c.taxId?.replace(/\D/g, "") ?? "";
    if (!digits) {
      continue;
    }
    if (c.id === "client-anchor" || !clientIds.has(digits)) {
      clientIds.set(digits, c.id);
    }
  }

  const anomaliesPath = path.join(rootDir, "ANOMALIES.json");
  const anomaliesJson = JSON.parse(await fs.readFile(anomaliesPath, "utf8")) as {
    unreconcilable_balances: Array<{ identificacion: string; saldo_declarado_crc: string }>;
  };
  const saldosArtifact = artifactIdForFile("clientes.xlsx#Saldos");
  for (const anomaly of anomaliesJson.unreconcilable_balances) {
    const digits = anomaly.identificacion.replace(/\D/g, "");
    const clientId = clientIds.get(digits);
    if (!clientId) {
      continue;
    }
    balances.push({
      id: `balance-${digits}`,
      clientId,
      declaredBalanceMinor: parseCrcMinor(anomaly.saldo_declarado_crc),
      currency: "CRC",
      provenance: prov(saldosArtifact, `ANOMALIES.json#${digits}`),
    });
  }

  const clientesCount = rows.filter((r) => r.parseStatus === "OK").length;

  return {
    clients,
    balances,
    rowCount: clientesCount,
  };
}

async function loadCsvDataRows(
  rootDir: string,
  fileName: string,
  delimiter?: ";" | ",",
): Promise<{ rowCount: number }> {
  const filePath = path.join(rootDir, fileName);
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const { text, encoding } = decodeCsvBytes(bytes);
  const sep = delimiter ?? detectDelimiter(text);
  const { rows } = parseCsvRows(text, {
    delimiter: sep,
    hasHeader: true,
    encoding,
  });
  const rowCount = rows.filter((r) => r.parseStatus === "OK").length;
  return { rowCount };
}

async function loadVentas(
  rootDir: string,
  clientByTax: Map<string, string>,
): Promise<{ invoices: NormalizedInvoice[]; rowCount: number }> {
  const filePath = path.join(rootDir, "ventas_2025.csv");
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const { text, encoding } = decodeCsvBytes(bytes);
  const { rows } = parseCsvRows(text, {
    delimiter: ";",
    hasHeader: true,
    encoding,
  });
  const artifactId = artifactIdForFile("ventas_2025.csv");

  const invoices: NormalizedInvoice[] = [];
  for (const row of rows) {
    if (row.parseStatus !== "OK") {
      continue;
    }
    const fields = (row.rawPayload.fields ?? {}) as Record<string, unknown>;
    const numero = fieldStr(fields, "numero_factura");
    const taxId = fieldStr(fields, "identificacion_cliente");
    const currency = fieldStr(fields, "moneda") || "CRC";
    const amountMinor = parseCrcMinor(fieldStr(fields, "monto_crc"));
    const clientId = clientByTax.get(taxId.replace(/\D/g, ""));

    invoices.push({
      id: `inv-ventas-${row.lineNumber}`,
      invoiceNumber: numero,
      amountMinor,
      currency,
      clientTaxId: taxId,
      clientId,
      issueDate: fieldStr(fields, "fecha") || undefined,
      recordHash: invoiceRecordHash(numero, amountMinor, currency),
      provenance: prov(artifactId, `ventas_2025.csv#${row.lineNumber}`),
    });
  }

  return {
    invoices,
    rowCount: rows.filter((r) => r.parseStatus === "OK").length,
  };
}

async function loadPagos(
  rootDir: string,
  clientByTax: Map<string, string>,
): Promise<{ payments: NormalizedPayment[]; rowCount: number }> {
  const filePath = path.join(rootDir, "pagos.csv");
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const { text, encoding } = decodeCsvBytes(bytes);
  const { rows } = parseCsvRows(text, {
    delimiter: ",",
    hasHeader: true,
    encoding,
  });
  const artifactId = artifactIdForFile("pagos.csv");

  const payments: NormalizedPayment[] = [];
  for (const row of rows) {
    if (row.parseStatus !== "OK") {
      continue;
    }
    const fields = (row.rawPayload.fields ?? {}) as Record<string, unknown>;
    const idPago = fieldStr(fields, "id_pago") || `pay-line-${row.lineNumber}`;
    const taxId = fieldStr(fields, "identificacion_cliente");
    const clientId = clientByTax.get(taxId.replace(/\D/g, ""));

    payments.push({
      id: idPago,
      amountMinor: parseCrcMinor(fieldStr(fields, "monto_crc")),
      currency: "CRC",
      invoiceNumber: fieldStr(fields, "numero_factura") || undefined,
      clientTaxId: taxId || undefined,
      clientId,
      paymentDate: fieldStr(fields, "fecha") || undefined,
      provenance: prov(artifactId, `pagos.csv#${row.lineNumber}`),
    });
  }

  return {
    payments,
    rowCount: rows.filter((r) => r.parseStatus === "OK").length,
  };
}

/**
 * Loads the on-disk demo-hvac-1000 fixture, normalizes rows, and runs reconcileDetect.
 */
export async function loadDemoHvac1000(rootDir: string): Promise<LoadDemoHvac1000Result> {
  const { clients, balances, rowCount: xlsxRows } = await loadClientsFromXlsx(rootDir);

  const clientByTax = new Map<string, string>();
  for (const c of clients) {
    if (!c.taxId) {
      continue;
    }
    const digits = c.taxId.replace(/\D/g, "");
    if (c.id === "client-anchor" || !clientByTax.has(digits)) {
      clientByTax.set(digits, c.id);
    }
  }

  const { invoices, rowCount: ventasRows } = await loadVentas(rootDir, clientByTax);
  const { payments, rowCount: pagosRows } = await loadPagos(rootDir, clientByTax);

  const equipos = await loadCsvDataRows(rootDir, "equipos_hvac.csv", ",");
  const inventario = await loadCsvDataRows(rootDir, "inventario.csv", ",");
  const notas = await loadCsvDataRows(rootDir, "notas.csv", ",");
  const feRows = await countFeXmlDocuments(rootDir);

  const rowCount =
    xlsxRows +
    ventasRows +
    pagosRows +
    equipos.rowCount +
    inventario.rowCount +
    notas.rowCount +
    feRows;

  const dataset: ReconcileDataset = {
    clients,
    invoices,
    payments,
    balances,
  };

  const reconcile = reconcileDetect(dataset);

  return { dataset, rowCount, reconcile };
}