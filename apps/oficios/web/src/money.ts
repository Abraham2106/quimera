const MINOR_PER_COLON = 100;

/** Convierte un monto escrito en colones (`1.500,00` o `1500.00`) a unidades menores enteras. */
export function colonesToMinor(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "").replace("₡", "");
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ""] = normalized.split(".");
  const cents = Number((frac + "00").slice(0, 2));
  return Number(whole) * MINOR_PER_COLON + cents;
}

/** Formato costarricense con numerales estables: `₡1.500,00`. */
export function formatColones(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / MINOR_PER_COLON);
  const cents = abs % MINOR_PER_COLON;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}₡${grouped},${cents.toString().padStart(2, "0")}`;
}

export function lineTotals(unitPriceMinor: number, quantity: number): {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
} {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const subtotalMinor = Math.round(unitPriceMinor * qty);
  const taxMinor = Math.round((subtotalMinor * 13) / 100);
  return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
}
