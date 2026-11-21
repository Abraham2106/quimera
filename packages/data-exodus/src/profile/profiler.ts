import type {
  ColumnPattern,
  ColumnProfile,
  SchemaProfile,
  SourceProfile,
  TabularSource,
} from "./types.js";

const TAX_ID = /^\d{9,12}$/;
const CABYS_13 = /^\d{13}$/;
const CABYS_SHORT = /^\d{8}$/;
const CLAVE_50 = /^\d{50}$/;
const DIGITS = /^\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;
const DMY_DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^(?:\+?506[\s-]?)?[24678]\d{7}$/;
const MONEY =
  /^(?:₡|\$|CRC|USD)?\s*-?\d+(?:[.,]\d+)?\s*(?:CRC|USD|₡|\$)?$/i;
const MONEY_TOKEN = /₡|\$|\bCRC\b|\bUSD\b/i;

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

function ratio(match: number, total: number): number {
  if (total === 0) return 0;
  return match / total;
}

function classifyColumn(
  column: string,
  values: readonly string[],
): { patterns: ColumnPattern[]; dominant: ColumnPattern } {
  const name = normalizeName(column);
  const present = values.filter((value) => !isBlank(value)).map((value) => value.trim());
  const total = present.length;
  const patterns = new Set<ColumnPattern>();

  const taxHits = present.filter((value) => TAX_ID.test(value.replace(/\D/g, "")) && DIGITS.test(value.replace(/\D/g, ""))).length;
  const cabys13 = present.filter((value) => CABYS_13.test(value)).length;
  const cabys8 = present.filter((value) => CABYS_SHORT.test(value)).length;
  const clave50 = present.filter((value) => CLAVE_50.test(value)).length;
  const claveLike = present.filter((value) => DIGITS.test(value) && value.length >= 20 && value.length !== 50).length;
  const iso = present.filter((value) => ISO_DATE.test(value)).length;
  const dmy = present.filter((value) => DMY_DATE.test(value)).length;
  const email = present.filter((value) => EMAIL.test(value)).length;
  const phone = present.filter((value) => PHONE.test(value.replace(/[\s-]/g, ""))).length;
  const money = present.filter((value) => MONEY.test(value.replace(/\s/g, " ").trim())).length;
  const crcMarks = present.filter((value) => /₡|\bCRC\b/i.test(value)).length;
  const usdMarks = present.filter((value) => /\$|\bUSD\b/i.test(value)).length;

  if (ratio(taxHits, total) >= 0.8 || (name.includes("identificacion") || name === "cedula" || name === "ced") && ratio(taxHits, total) >= 0.8) {
    patterns.add("CR_TAX_ID");
  }
  if (name.includes("cabys") && ratio(cabys13 + cabys8, total) >= 0.8) {
    patterns.add("CABYS");
  } else if (ratio(cabys13, total) >= 0.8) {
    patterns.add("CABYS");
  }
  if (ratio(clave50, total) >= 0.8 || (name.includes("clave") && ratio(clave50, total) >= 0.8)) {
    patterns.add("CLAVE_50");
  } else if (name.includes("clave") && ratio(claveLike, total) >= 0.8) {
    patterns.add("CLAVE_CANDIDATE");
  }
  if (ratio(email, total) >= 0.8 || (/(correo|email)/.test(name) && ratio(email, total) >= 0.8)) {
    patterns.add("EMAIL");
  }
  if (ratio(phone, total) >= 0.8 || (/(telefono|celular|phone|^tel$)/.test(name) && ratio(phone, total) >= 0.8)) {
    patterns.add("CR_PHONE");
  }

  const isoRatio = ratio(iso, total);
  const dmyRatio = ratio(dmy, total);
  if (isoRatio >= 0.1 && dmyRatio >= 0.1) {
    patterns.add("DATE_MIXED");
  } else if (isoRatio >= 0.8 || (/(fecha|emision|servicio)/.test(name) && isoRatio >= 0.8)) {
    patterns.add("DATE_ISO");
  } else if (dmyRatio >= 0.8) {
    patterns.add("DATE_DMY");
  }

  const moneyRatio = ratio(money, total);
  const namedMoney = /(monto|saldo|costo|precio|total)/.test(name);
  if ((moneyRatio >= 0.8 || (namedMoney && moneyRatio >= 0.8)) && (crcMarks > 0 && usdMarks > 0 || (present.some((value) => MONEY_TOKEN.test(value)) && crcMarks > 0 && usdMarks > 0))) {
    patterns.add("CURRENCY_MIXED");
  } else if (moneyRatio >= 0.8 && (namedMoney || present.some((value) => MONEY_TOKEN.test(value)) || /[.,]\d{2}$/.test(present[0] ?? ""))) {
    patterns.add("CURRENCY");
  } else if (namedMoney && moneyRatio >= 0.8) {
    patterns.add("CURRENCY");
  }
  if (crcMarks > 0 && usdMarks > 0) {
    patterns.add("CURRENCY_MIXED");
    patterns.delete("CURRENCY");
  }

  if (patterns.size === 0) {
    const avg =
      total === 0 ? 0 : present.reduce((sum, value) => sum + value.length, 0) / total;
    patterns.add(avg >= 24 ? "FREE_TEXT" : total > 0 ? "CODE" : "UNKNOWN");
  }

  const priority: ColumnPattern[] = [
    "CURRENCY_MIXED",
    "DATE_MIXED",
    "CR_TAX_ID",
    "CABYS",
    "CLAVE_50",
    "CLAVE_CANDIDATE",
    "CURRENCY",
    "DATE_ISO",
    "DATE_DMY",
    "EMAIL",
    "CR_PHONE",
    "FREE_TEXT",
    "CODE",
    "UNKNOWN",
  ];
  const ordered = priority.filter((pattern) => patterns.has(pattern));
  return { patterns: ordered, dominant: ordered[0] ?? "UNKNOWN" };
}

export function profileTables(
  sources: readonly TabularSource[],
  options?: { sample?: number },
): SchemaProfile {
  const sampleLimit = options?.sample;
  const profiled: SourceProfile[] = sources.map((source) => {
    const sampled =
      sampleLimit !== undefined && source.rows.length > sampleLimit;
    const rows = sampled ? source.rows.slice(0, sampleLimit) : source.rows;
    const columns: ColumnProfile[] = source.columns.map((column) => {
      const values = rows.map((row) => row[column] ?? "");
      const present = values.filter((value) => !isBlank(value));
      const distinct = new Set(present.map((value) => value.trim()));
      const lengths = present.map((value) => value.trim().length);
      const classified = classifyColumn(column, values);
      return {
        sourceId: source.sourceId,
        column,
        nullRate: values.length === 0 ? 1 : (values.length - present.length) / values.length,
        distinctCount: distinct.size,
        minLength: lengths.length === 0 ? 0 : Math.min(...lengths),
        maxLength: lengths.length === 0 ? 0 : Math.max(...lengths),
        sampleSize: rows.length,
        rowCount: source.rows.length,
        patterns: classified.patterns,
        dominantPattern: classified.dominant,
      };
    });
    return {
      sourceId: source.sourceId,
      rowCount: source.rows.length,
      sampled,
      columns,
    };
  });

  return {
    version: "1",
    estimated: profiled.some((source) => source.sampled),
    sources: profiled,
  };
}

export function columnByName(
  profile: SchemaProfile,
  sourceId: string,
  column: string,
): ColumnProfile | undefined {
  return profile.sources
    .find((source) => source.sourceId === sourceId)
    ?.columns.find((entry) => entry.column === column);
}
