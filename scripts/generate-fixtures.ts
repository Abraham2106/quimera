#!/usr/bin/env tsx
/**
 * Generador determinista del fixture sintético demo-hvac-1000.
 * Uso: npx tsx scripts/generate-fixtures.ts --seed 20261121
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const requireFromDataExodus = createRequire(
  path.join(REPO_ROOT, "packages", "data-exodus", "package.json"),
);
const ExcelJS = requireFromDataExodus("exceljs") as typeof import("exceljs");
const DEFAULT_OUT = path.join(REPO_ROOT, "fixtures", "demo-hvac-1000");
const FIXED_ISO = "2026-11-21T00:00:00.000Z";

const EXPECTED = {
  duplicate_client_groups: 40,
  duplicate_invoices: 12,
  misattributed_payments: 7,
  conflicting_identity_pairs: 3,
  unreconcilable_balances: 1,
} as const;

/** Record row targets (~1000 data rows across the seven artifact kinds). */
const ROW_TARGETS = {
  clientes: 240,
  ventas: 280,
  pagos: 160,
  equipos: 140,
  inventario: 130,
  notas: 50,
} as const;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv: string[]): { seed: number; outDir: string } {
  let seed = 20261121;
  let outDir = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed" && argv[i + 1]) {
      seed = Number.parseInt(argv[++i]!, 10);
    } else if (a === "--out" && argv[i + 1]) {
      outDir = path.resolve(argv[++i]!);
    } else if (a === "--help" || a === "-h") {
      console.log("Uso: tsx scripts/generate-fixtures.ts [--seed 20261121] [--out fixtures/demo-hvac-1000]");
      process.exit(0);
    }
  }
  if (!Number.isFinite(seed)) {
    console.error("Semilla inválida");
    process.exit(1);
  }
  return { seed, outDir };
}

function padId(n: number): string {
  return `9${String(n).padStart(9, "0")}`;
}

function fakePhone(n: number): string {
  return `8888-${String(1000 + (n % 9000)).padStart(4, "0")}`;
}

function crcToIso(dayOffset: number): string {
  const base = Date.UTC(2025, 0, 15);
  const d = new Date(base + dayOffset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function excelSerialFromIso(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, d!);
  const epoch = Date.UTC(1899, 11, 30);
  return (utc - epoch) / 86_400_000;
}

function csvEscape(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: string[][], delimiter = ","): string {
  return `${rows.map((r) => r.map((c) => csvEscape(c, delimiter)).join(delimiter)).join("\n")}\n`;
}

function crcColones(cents: number): string {
  return (cents / 100).toFixed(2);
}

interface ClientRow {
  grupo_id: string;
  identificacion: string;
  razon_social: string;
  telefono: string;
  correo: string;
  provincia: string;
  activo: string;
  notas: string;
  saldo_declarado_crc?: string;
}

interface VentaRow {
  numero_factura: string;
  fecha: string;
  identificacion_cliente: string;
  cliente: string;
  descripcion: string;
  monto_crc: string;
  moneda: string;
  cabys: string;
}

interface PagoRow {
  id_pago: string;
  fecha: string;
  numero_factura: string;
  identificacion_cliente: string;
  monto_crc: string;
  metodo: string;
  referencia: string;
}

interface AnomalyManifest {
  seed: number;
  generator: string;
  generated_at: string;
  disclaimer: string;
  counts: typeof EXPECTED;
  duplicate_client_groups: Array<{
    grupo_id: string;
    identificacion: string;
    variantes: string[];
    filas_xlsx: number[];
  }>;
  duplicate_invoices: Array<{
    numero_factura: string;
    filas_ventas_csv: number[];
    montos_crc: string[];
  }>;
  misattributed_payments: Array<{
    id_pago: string;
    factura_cliente_id: string;
    pago_cliente_id: string;
    numero_factura: string;
  }>;
  conflicting_identity_pairs: Array<{
    razon_social: string;
    identificaciones: string[];
    filas_xlsx: number[];
  }>;
  unreconcilable_balances: Array<{
    identificacion: string;
    razon_social: string;
    saldo_declarado_crc: string;
    saldo_calculado_crc: string;
    fila_xlsx: number;
  }>;
  record_totals: Record<string, number>;
}

function buildDataset(seed: number) {
  const rng = mulberry32(seed);

  const clients: ClientRow[] = [];
  const ventas: VentaRow[] = [];
  const pagos: PagoRow[] = [];
  const equipos: string[][] = [];
  const inventario: string[][] = [];
  const notas: string[][] = [];

  const duplicateGroups: AnomalyManifest["duplicate_client_groups"] = [];
  const duplicateInvoices: AnomalyManifest["duplicate_invoices"] = [];
  const misPayments: AnomalyManifest["misattributed_payments"] = [];
  const conflictingPairs: AnomalyManifest["conflicting_identity_pairs"] = [];
  const badBalances: AnomalyManifest["unreconcilable_balances"] = [];

  let nextId = 1_000_001;
  const allocId = () => padId(nextId++);

  // --- Conflicting identity: 3 pairs (same name, different IDs) ---
  const conflictNames = [
    "Taller Sintetico Conflicto A",
    "Distribuidora Sintetica Conflicto B",
    "Refrigeración Sintetica Conflicto C",
  ];
  for (let i = 0; i < EXPECTED.conflicting_identity_pairs; i++) {
    const name = conflictNames[i]!;
    const idA = allocId();
    const idB = allocId();
    const rowA: ClientRow = {
      grupo_id: `CONF-${i + 1}`,
      identificacion: idA,
      razon_social: name,
      telefono: fakePhone(500 + i),
      correo: `conflicto${i + 1}a@ejemplo-sintetico.invalid`,
      provincia: "San José",
      activo: "SI",
      notas: "Par contradictorio sembrado (sintético)",
    };
    const rowB: ClientRow = { ...rowA, grupo_id: `CONF-${i + 1}-B`, identificacion: idB, correo: `conflicto${i + 1}b@ejemplo-sintetico.invalid` };
    clients.push(rowA, rowB);
    conflictingPairs.push({
      razon_social: name,
      identificaciones: [idA, idB],
      filas_xlsx: [clients.length - 1, clients.length],
    });
  }

  // --- Duplicate client groups: 40 ---
  for (let g = 0; g < EXPECTED.duplicate_client_groups; g++) {
    const grupoId = `DUP-${String(g + 1).padStart(2, "0")}`;
    const id = allocId();
    const base = `Taller Sintetico ${String(g + 1).padStart(2, "0")}`;
    const variants = [
      base,
      `${base} S.A.`,
      `${base} — sucursal este`,
      `${base} (mantenimiento)`,
    ];
    const v1 = variants[g % variants.length]!;
    const v2 = variants[(g + 1) % variants.length]!;
    const row1: ClientRow = {
      grupo_id: grupoId,
      identificacion: id,
      razon_social: v1,
      telefono: fakePhone(1000 + g),
      correo: `taller${g + 1}@ejemplo-sintetico.invalid`,
      provincia: g % 2 === 0 ? "Alajuela" : "Cartago",
      activo: "SI",
      notas: "Grupo duplicado sintético",
    };
    const row2: ClientRow = { ...row1, razon_social: v2, correo: `taller${g + 1}.alt@ejemplo-sintetico.invalid` };
    clients.push(row1, row2);
    duplicateGroups.push({
      grupo_id: grupoId,
      identificacion: id,
      variantes: [v1, v2],
      filas_xlsx: [clients.length - 1, clients.length],
    });
  }

  // --- Fill remaining client rows (unique synthetic businesses) ---
  const clientTarget = ROW_TARGETS.clientes;
  while (clients.length < clientTarget - 1) {
    const n = clients.length + 1;
    clients.push({
      grupo_id: `CLI-${String(n).padStart(4, "0")}`,
      identificacion: allocId(),
      razon_social: `Empresa Sintetica HVAC ${String(n).padStart(3, "0")}`,
      telefono: fakePhone(2000 + n),
      correo: `empresa${n}@ejemplo-sintetico.invalid`,
      provincia: ["San José", "Heredia", "Guanacaste", "Puntarenas"][n % 4]!,
      activo: n % 17 === 0 ? "NO" : "SI",
      notas: n % 5 === 0 ? "Cliente ocasional — datos ficticios" : "",
    });
  }

  // --- One unreconcilable balance row (last client row with explicit saldo) ---
  const balanceClientId = allocId();
  const balanceName = "Cliente Saldo Irreconciliable Sintetico";
  const saldoDeclarado = 125_000.0;
  const saldoCalculado = 98_450.5;
  clients.push({
    grupo_id: "BAL-01",
    identificacion: balanceClientId,
    razon_social: balanceName,
    telefono: fakePhone(9999),
    correo: "saldo-irreconciliable@ejemplo-sintetico.invalid",
    provincia: "San José",
    activo: "SI",
    notas: "Saldo declarado no cuadra con facturas/pagos (sembrado)",
    saldo_declarado_crc: saldoDeclarado.toFixed(2),
  });
  badBalances.push({
    identificacion: balanceClientId,
    razon_social: balanceName,
    saldo_declarado_crc: saldoDeclarado.toFixed(2),
    saldo_calculado_crc: saldoCalculado.toFixed(2),
    fila_xlsx: clients.length,
  });

  // --- Ventas ---
  let ventaRowNum = 1;

  for (let i = 0; i < EXPECTED.duplicate_invoices; i++) {
    const num = `FV-2025-DUP-${String(i + 1).padStart(3, "0")}`;
    const c = clients[i % clients.length]!;
    const monto1 = 50_000 + i * 1_337;
    const monto2 = monto1 + (i % 3 === 0 ? 500 : 0);
    const rows: VentaRow[] = [
      {
        numero_factura: num,
        fecha: crcToIso(30 + i),
        identificacion_cliente: c.identificacion,
        cliente: c.razon_social,
        descripcion: `Servicio HVAC duplicado sintético #${i + 1}`,
        monto_crc: monto1.toFixed(2),
        moneda: "CRC",
        cabys: `841${String(11500 + i).padStart(5, "0")}`,
      },
      {
        numero_factura: num,
        fecha: crcToIso(31 + i),
        identificacion_cliente: c.identificacion,
        cliente: c.razon_social,
        descripcion: `Copia sembrada factura ${num}`,
        monto_crc: monto2.toFixed(2),
        moneda: "CRC",
        cabys: `841${String(11500 + i).padStart(5, "0")}`,
      },
    ];
    const start = ventaRowNum;
    for (const r of rows) {
      ventas.push(r);
      ventaRowNum++;
    }
    duplicateInvoices.push({
      numero_factura: num,
      filas_ventas_csv: [start, start + 1],
      montos_crc: [monto1.toFixed(2), monto2.toFixed(2)],
    });
  }

  // Ventas for balance client (feeds calculated balance)
  ventas.push({
    numero_factura: "FV-2025-BAL-001",
    fecha: "2025-06-01",
    identificacion_cliente: balanceClientId,
    cliente: balanceName,
    descripcion: "Instalación equipo frío (sintético)",
    monto_crc: "120000.00",
    moneda: "CRC",
    cabys: "8411150000000",
  });
  ventaRowNum++;

  ventas.push({
    numero_factura: "FV-2025-BAL-002",
    fecha: "2025-07-15",
    identificacion_cliente: balanceClientId,
    cliente: balanceName,
    descripcion: "Mantenimiento preventivo (sintético)",
    monto_crc: "28450.50",
    moneda: "CRC",
    cabys: "8411150000010",
  });
  ventaRowNum++;

  const ventaTarget = ROW_TARGETS.ventas;
  let v = ventas.length;
  while (ventas.length < ventaTarget) {
    const idx = Math.floor(rng() * clients.length);
    const c = clients[idx]!;
    const n = v + 1;
    ventas.push({
      numero_factura: `FV-2025-${String(n).padStart(5, "0")}`,
      fecha: crcToIso(n % 300),
      identificacion_cliente: c.identificacion,
      cliente: c.razon_social,
      descripcion:
        n % 7 === 0
          ? "Revisión de sistema con ñoño y acentuación — descripción sintética"
          : `Venta HVAC sintética línea ${n}`,
      monto_crc: crcColones(25_000_00 + Math.floor(rng() * 400_000_00)),
      moneda: "CRC",
      cabys: `841${String(12000 + (n % 800)).padStart(5, "0")}`,
    });
    v++;
  }

  // --- Pagos: 7 misattributed ---
  let pagoId = 1;
  for (let i = 0; i < EXPECTED.misattributed_payments; i++) {
    const factura = ventas[20 + i]!;
    const wrongClient = clients[(i * 7 + 13) % clients.length]!;
    if (wrongClient.identificacion === factura.identificacion_cliente) {
      const alt = clients[(i * 7 + 14) % clients.length]!;
      misPayments.push({
        id_pago: `PAG-MIS-${String(i + 1).padStart(2, "0")}`,
        factura_cliente_id: factura.identificacion_cliente,
        pago_cliente_id: alt.identificacion,
        numero_factura: factura.numero_factura,
      });
      pagos.push({
        id_pago: `PAG-MIS-${String(i + 1).padStart(2, "0")}`,
        fecha: factura.fecha,
        numero_factura: factura.numero_factura,
        identificacion_cliente: alt.identificacion,
        monto_crc: factura.monto_crc,
        metodo: "SINPE",
        referencia: `REF-MIS-${i + 1}`,
      });
    } else {
      misPayments.push({
        id_pago: `PAG-MIS-${String(i + 1).padStart(2, "0")}`,
        factura_cliente_id: factura.identificacion_cliente,
        pago_cliente_id: wrongClient.identificacion,
        numero_factura: factura.numero_factura,
      });
      pagos.push({
        id_pago: `PAG-MIS-${String(i + 1).padStart(2, "0")}`,
        fecha: factura.fecha,
        numero_factura: factura.numero_factura,
        identificacion_cliente: wrongClient.identificacion,
        monto_crc: factura.monto_crc,
        metodo: "SINPE",
        referencia: `REF-MIS-${i + 1}`,
      });
    }
    pagoId++;
  }

  // Payment for balance client (partial — makes declared balance wrong)
  pagos.push({
    id_pago: "PAG-BAL-001",
    fecha: "2025-08-01",
    numero_factura: "FV-2025-BAL-001",
    identificacion_cliente: balanceClientId,
    monto_crc: "50000.00",
    metodo: "TRANSFERENCIA",
    referencia: "REF-BAL-1",
  });

  const pagoTarget = ROW_TARGETS.pagos;
  while (pagos.length < pagoTarget) {
    const venta = ventas[Math.floor(rng() * ventas.length)]!;
    const id = `PAG-${String(pagoId++).padStart(5, "0")}`;
    pagos.push({
      id_pago: id,
      fecha: venta.fecha,
      numero_factura: venta.numero_factura,
      identificacion_cliente: venta.identificacion_cliente,
      monto_crc: venta.monto_crc,
      metodo: ["SINPE", "EFECTIVO", "TARJETA"][Math.floor(rng() * 3)]!,
      referencia: `REF-${id}`,
    });
  }

  // --- Equipos HVAC ---
  equipos.push([
    "tag_equipo",
    "identificacion_cliente",
    "cliente",
    "tipo",
    "marca",
    "modelo",
    "serie",
    "ubicacion",
    "ultimo_servicio",
    "refrigerante",
  ]);
  for (let i = 0; i < ROW_TARGETS.equipos; i++) {
    const c = clients[i % clients.length]!;
    equipos.push([
      `EQ-${String(i + 1).padStart(5, "0")}`,
      c.identificacion,
      c.razon_social,
      ["Chiller", "Mini-split", "Cuarto frío", "Torre enfriamiento"][i % 4]!,
      ["SintMarcaA", "SintMarcaB", "SintMarcaC"][i % 3]!,
      `MOD-${1000 + i}`,
      `SER-${9000000 + i}`,
      i % 2 === 0 ? "Planta baja" : "Azotea",
      crcToIso(100 + i),
      ["R-410A", "R-32", "R-134a"][i % 3]!,
    ]);
  }

  // --- Inventario ---
  inventario.push(["sku", "descripcion", "unidad", "existencia", "costo_promedio_crc", "ubicacion_bodega"]);
  for (let i = 0; i < ROW_TARGETS.inventario; i++) {
    inventario.push([
      `SKU-${String(i + 1).padStart(4, "0")}`,
      `Repuesto sintético ${i + 1}${i % 4 === 0 ? " — filtro aspiración" : ""}`,
      ["UND", "M", "KG"][i % 3]!,
      String(5 + (i % 50)),
      crcColones(1_500_00 + i * 250),
      `BODEGA-${(i % 3) + 1}`,
    ]);
  }

  // --- Notas (crédito / observaciones) ---
  notas.push([
    "numero_nota",
    "fecha",
    "numero_factura_ref",
    "identificacion_cliente",
    "tipo",
    "monto_crc",
    "comentario",
  ]);
  for (let i = 0; i < ROW_TARGETS.notas; i++) {
    const venta = ventas[(i * 3) % ventas.length]!;
    notas.push([
      `NC-2025-${String(i + 1).padStart(4, "0")}`,
      crcToIso(200 + i),
      venta.numero_factura,
      venta.identificacion_cliente,
      i % 5 === 0 ? "CREDITO" : "DEBITO",
      crcColones(i % 5 === 0 ? -5_000_00 : 2_000_00),
      i % 6 === 0 ? "Ajuste por garantía — texto con tildes: revisión técnica" : "Nota sintética",
    ]);
  }

  const recordTotals = {
    clientes_xlsx: clients.length,
    ventas_2025_csv: ventas.length,
    pagos_csv: pagos.length,
    equipos_hvac_csv: ROW_TARGETS.equipos,
    inventario_csv: ROW_TARGETS.inventario,
    notas_csv: ROW_TARGETS.notas,
    facturas_fe_xml: 2,
    total_filas_datos:
      clients.length +
      ventas.length +
      pagos.length +
      ROW_TARGETS.equipos +
      ROW_TARGETS.inventario +
      ROW_TARGETS.notas,
  };

  const anomalies: AnomalyManifest = {
    seed,
    generator: "scripts/generate-fixtures.ts",
    generated_at: FIXED_ISO,
    disclaimer:
      "Datos 100 % sintéticos. Identificaciones 9xxxxxxxxx, correos *.invalid, sin personas reales de Costa Rica.",
    counts: { ...EXPECTED },
    duplicate_client_groups: duplicateGroups,
    duplicate_invoices: duplicateInvoices,
    misattributed_payments: misPayments,
    conflicting_identity_pairs: conflictingPairs,
    unreconcilable_balances: badBalances,
    record_totals: recordTotals,
  };

  return {
    clients,
    ventas,
    pagos,
    equipos,
    inventario,
    notas,
    anomalies,
    balanceClientId,
    balanceName,
  };
}

/** Reempaqueta el XLSX con marcas de tiempo ZIP fijas (misma semilla → mismos bytes). */
function normalizeXlsxZipTimestamps(filePath: string): void {
  const py = `
import sys, zipfile
from pathlib import Path
FIXED = (1980, 1, 1, 0, 0, 0)
src = Path(sys.argv[1])
tmp = src.with_suffix(".tmp.xlsx")
with zipfile.ZipFile(src, "r") as zin:
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for info in sorted(zin.infolist(), key=lambda i: i.filename):
            data = zin.read(info.filename)
            ni = zipfile.ZipInfo(filename=info.filename, date_time=FIXED)
            ni.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(ni, data)
tmp.replace(src)
`;
  const result = spawnSync("python3", ["-c", py, filePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "normalizeXlsxZipTimestamps failed");
  }
}

async function writeClientesXlsx(outPath: string, clients: ClientRow[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "quimera-fixture-generator";
  wb.created = new Date(FIXED_ISO);
  wb.modified = new Date(FIXED_ISO);

  const wsClientes = wb.addWorksheet("Clientes");
  wsClientes.columns = [
    { header: "grupo_id", key: "grupo_id", width: 14 },
    { header: "identificacion", key: "identificacion", width: 14 },
    { header: "razon_social", key: "razon_social", width: 36 },
    { header: "telefono", key: "telefono", width: 14 },
    { header: "correo", key: "correo", width: 32 },
    { header: "provincia", key: "provincia", width: 14 },
    { header: "activo", key: "activo", width: 8 },
    { header: "notas", key: "notas", width: 24 },
    { header: "fecha_alta", key: "fecha_alta", width: 14 },
  ];
  clients.forEach((c, i) => {
    const iso = crcToIso(i % 400);
    wsClientes.addRow({
      ...c,
      fecha_alta: excelSerialFromIso(iso),
    });
  });
  // Formula without cached result on row 2 (acceptance test expects warning)
  const formulaCell = wsClientes.getRow(2).getCell("notas");
  formulaCell.value = { formula: 'CONCATENATE("Obs:",A2)', result: undefined };

  const wsContactos = wb.addWorksheet("Contactos");
  wsContactos.columns = [
    { header: "identificacion", key: "identificacion", width: 14 },
    { header: "contacto", key: "contacto", width: 28 },
    { header: "rol", key: "rol", width: 16 },
    { header: "telefono", key: "telefono", width: 14 },
  ];
  for (let i = 0; i < Math.min(60, clients.length); i++) {
    const c = clients[i]!;
    wsContactos.addRow({
      identificacion: c.identificacion,
      contacto: `Contacto Sintetico ${i + 1}`,
      rol: i % 2 === 0 ? "Facturación" : "Mantenimiento",
      telefono: fakePhone(3000 + i),
    });
  }

  const wsSaldos = wb.addWorksheet("Saldos");
  wsSaldos.columns = [
    { header: "identificacion", key: "identificacion", width: 14 },
    { header: "razon_social", key: "razon_social", width: 36 },
    { header: "saldo_declarado_crc", key: "saldo_declarado_crc", width: 18 },
    { header: "ultima_actualizacion", key: "ultima_actualizacion", width: 18 },
  ];
  for (const c of clients) {
    if (c.saldo_declarado_crc) {
      wsSaldos.addRow({
        identificacion: c.identificacion,
        razon_social: c.razon_social,
        saldo_declarado_crc: Number.parseFloat(c.saldo_declarado_crc),
        ultima_actualizacion: excelSerialFromIso("2025-09-01"),
      });
    }
  }
  for (let i = 0; i < 25; i++) {
    const c = clients[i * 3]!;
    if (c.saldo_declarado_crc) continue;
    wsSaldos.addRow({
      identificacion: c.identificacion,
      razon_social: c.razon_social,
      saldo_declarado_crc: 1_000 + i * 500,
      ultima_actualizacion: excelSerialFromIso(crcToIso(50 + i)),
    });
  }

  await wb.xlsx.writeFile(outPath);
  normalizeXlsxZipTimestamps(outPath);
}

function feSampleXml(opts: {
  fileName: string;
  clave: string;
  numero: string;
  emisorId: string;
  receptorId: string;
  receptorNombre: string;
  total: string;
  fecha: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- quimera:fe-sample — comprobante sintético, NO válido para validación SDK en producción -->
<FacturaElectronica
  xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica"
  quimera-fe-sample="true">
  <Clave>${opts.clave}</Clave>
  <NumeroConsecutivo>${opts.numero}</NumeroConsecutivo>
  <FechaEmision>${opts.fecha}T10:00:00-06:00</FechaEmision>
  <Emisor>
    <Nombre>Emisor Sintetico Demo QUIMERA</Nombre>
    <Identificacion>
      <Tipo>02</Tipo>
      <Numero>${opts.emisorId}</Numero>
    </Identificacion>
  </Emisor>
  <Receptor>
    <Nombre>${opts.receptorNombre}</Nombre>
    <Identificacion>
      <Tipo>02</Tipo>
      <Numero>${opts.receptorId}</Numero>
    </Identificacion>
  </Receptor>
  <ResumenFactura>
    <CodigoTipoMoneda>
      <CodigoMoneda>CRC</CodigoMoneda>
    </CodigoTipoMoneda>
    <TotalComprobante>${opts.total}</TotalComprobante>
  </ResumenFactura>
</FacturaElectronica>
`;
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertCounts(manifest: AnomalyManifest): void {
  const c = manifest.counts;
  const ok =
    manifest.duplicate_client_groups.length === EXPECTED.duplicate_client_groups &&
    manifest.duplicate_invoices.length === EXPECTED.duplicate_invoices &&
    manifest.misattributed_payments.length === EXPECTED.misattributed_payments &&
    manifest.conflicting_identity_pairs.length === EXPECTED.conflicting_identity_pairs &&
    manifest.unreconcilable_balances.length === EXPECTED.unreconcilable_balances &&
    c.duplicate_client_groups === EXPECTED.duplicate_client_groups &&
    c.duplicate_invoices === EXPECTED.duplicate_invoices &&
    c.misattributed_payments === EXPECTED.misattributed_payments &&
    c.conflicting_identity_pairs === EXPECTED.conflicting_identity_pairs &&
    c.unreconcilable_balances === EXPECTED.unreconcilable_balances;

  const counts = {
    duplicate_client_groups: manifest.duplicate_client_groups.length,
    duplicate_invoices: manifest.duplicate_invoices.length,
    misattributed_payments: manifest.misattributed_payments.length,
    conflicting_identity_pairs: manifest.conflicting_identity_pairs.length,
    unreconcilable_balances: manifest.unreconcilable_balances.length,
  };

  console.log("COUNTS", JSON.stringify(counts));
  console.log("RECORD_TOTALS", JSON.stringify(manifest.record_totals));

  if (!ok) {
    console.error("VALIDATION_FAILED: los conteos de anomalías no coinciden con", EXPECTED);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { seed, outDir } = parseArgs(process.argv.slice(2));
  const data = buildDataset(seed);

  assertCounts(data.anomalies);

  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, "fe"), { recursive: true });

  await writeClientesXlsx(path.join(outDir, "clientes.xlsx"), data.clients);

  const ventasRows = [
    [
      "numero_factura",
      "fecha",
      "identificacion_cliente",
      "cliente",
      "descripcion",
      "monto_crc",
      "moneda",
      "cabys",
    ],
    ...data.ventas.map((v) => [
      v.numero_factura,
      v.fecha,
      v.identificacion_cliente,
      v.cliente,
      v.descripcion,
      v.monto_crc,
      v.moneda,
      v.cabys,
    ]),
  ];
  await writeFile(path.join(outDir, "ventas_2025.csv"), toCsv(ventasRows, ";"), "utf8");

  const pagosRows = [
    ["id_pago", "fecha", "numero_factura", "identificacion_cliente", "monto_crc", "metodo", "referencia"],
    ...data.pagos.map((p) => [
      p.id_pago,
      p.fecha,
      p.numero_factura,
      p.identificacion_cliente,
      p.monto_crc,
      p.metodo,
      p.referencia,
    ]),
  ];
  await writeFile(path.join(outDir, "pagos.csv"), toCsv(pagosRows), "utf8");
  await writeFile(path.join(outDir, "equipos_hvac.csv"), toCsv(data.equipos), "utf8");
  await writeFile(path.join(outDir, "inventario.csv"), toCsv(data.inventario), "utf8");
  await writeFile(path.join(outDir, "notas.csv"), toCsv(data.notas), "utf8");

  const emisor = padId(100_000);
  const xml1 = feSampleXml({
    fileName: "FE-001-fe-sample.xml",
    clave: "506110100" + "9001000001" + "00100001010000000121",
    numero: "00100001010000000121",
    emisorId: emisor,
    receptorId: data.balanceClientId,
    receptorNombre: data.balanceName,
    total: "120000.00",
    fecha: "2025-06-01",
  });
  const xml2 = feSampleXml({
    fileName: "FE-002-fe-sample.xml",
    clave: "506110100" + "9001000001" + "00100001010000000221",
    numero: "00100001010000000221",
    emisorId: emisor,
    receptorId: data.clients[0]!.identificacion,
    receptorNombre: data.clients[0]!.razon_social,
    total: "45250.00",
    fecha: "2025-04-12",
  });
  await writeFile(path.join(outDir, "fe", "FE-001-fe-sample.xml"), xml1, "utf8");
  await writeFile(path.join(outDir, "fe", "FE-002-fe-sample.xml"), xml2, "utf8");

  await writeFile(path.join(outDir, "ANOMALIES.json"), stableStringify(data.anomalies), "utf8");

  const readme = `# demo-hvac-1000 (sintético)

Generado con \`npx tsx scripts/generate-fixtures.ts --seed ${seed}\`.

## Archivos (7 fuentes de datos + manifiesto)

| Archivo | Descripción |
|---------|-------------|
| \`clientes.xlsx\` | Libro multi-hoja (Clientes, Contactos, Saldos) |
| \`ventas_2025.csv\` | Ventas 2025, delimitador \`;\`, UTF-8 con acentos |
| \`pagos.csv\` | Pagos y referencias |
| \`equipos_hvac.csv\` | Equipos por cliente |
| \`inventario.csv\` | Repuestos en bodega |
| \`notas.csv\` | Notas de crédito/débito |
| \`fe/*.xml\` | Mínimo 2 comprobantes marcados \`quimera:fe-sample\` (no válidos para SDK productivo) |

## Anomalías sembradas (ver \`ANOMALIES.json\`)

- 40 grupos de cliente repetido bajo nombres variantes
- 12 facturas duplicadas (mismo número)
- 7 pagos atribuidos a cliente distinto del de la factura
- 3 pares misma razón social con identificaciones distintas
- 1 saldo declarado que no cuadra con facturas − pagos

**Cero datos personales reales de Costa Rica.** Identificaciones \`9XXXXXXXXX\`, teléfonos \`8888-XXXX\`, dominios \`*.invalid\`.
`;
  await writeFile(path.join(outDir, "README.md"), readme, "utf8");

  console.log(`OK seed=${seed} out=${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});