import { z } from "zod";
import { CrCurrencySchema } from "./schemas/primitives.js";

/**
 * Escala fiscal CR: 5 decimales según requisitos de conciliación (QR-CORE-009).
 * 1 unidad mayor = 100_000 unidades menores fiscales.
 */
export const FISCAL_MINOR_SCALE = 100_000n;

/** Centavos CRC (2 decimales) para operaciones cotidianas de demo. */
export const CRC_CENT_SCALE = 100n;

export const MoneySchema = z.object({
  amountMinor: z.bigint(),
  currency: CrCurrencySchema,
});

export type Money = z.infer<typeof MoneySchema>;

export type MoneyInput =
  | Money
  | { readonly amountMinor: bigint; readonly currency: "CRC" | "USD" };

const MONEY_DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function parseCrMoney(
  decimal: string,
  currency: "CRC" | "USD" = "CRC",
  scale: bigint = CRC_CENT_SCALE,
): Money {
  const trimmed = decimal.trim();
  if (!MONEY_DECIMAL_RE.test(trimmed)) {
    throw new Error(`invalid money decimal: ${decimal}`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = unsigned.split(".");
  const scaleDigits = String(scale).length - 1;
  if (frac.length > scaleDigits) {
    throw new Error(`too many decimal places (max ${scaleDigits})`);
  }
  const paddedFrac = frac.padEnd(scaleDigits, "0");
  const minor = BigInt(whole + paddedFrac);
  return {
    currency,
    amountMinor: negative ? -minor : minor,
  };
}

export function toFiscalMinor(money: Money): Money {
  if (money.currency !== "CRC") {
    throw new Error("toFiscalMinor only supports CRC");
  }
  const factor = FISCAL_MINOR_SCALE / CRC_CENT_SCALE;
  return {
    currency: "CRC",
    amountMinor: money.amountMinor * factor,
  };
}

export function addMoney(a: MoneyInput, b: MoneyInput): Money {
  assertSameCurrency(a, b);
  return {
    currency: a.currency,
    amountMinor: a.amountMinor + b.amountMinor,
  };
}

export function subMoney(a: MoneyInput, b: MoneyInput): Money {
  assertSameCurrency(a, b);
  return {
    currency: a.currency,
    amountMinor: a.amountMinor - b.amountMinor,
  };
}

function assertSameCurrency(a: MoneyInput, b: MoneyInput): void {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

/** Suma montos en escala fiscal de 5 decimales usando enteros exactos. */
export function addFiscalAmounts(decimals: readonly string[]): bigint {
  return decimals.reduce((acc, d) => acc + parseCrMoney(d, "CRC", FISCAL_MINOR_SCALE).amountMinor, 0n);
}