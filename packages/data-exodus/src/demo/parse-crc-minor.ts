/**
 * Parsea montos CRC a centavos (bigint) sin pasar por float.
 */
export function parseCrcMinor(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return 0n;
    }
    const sign = value < 0 ? -1n : 1n;
    const abs = Math.abs(value);
    const whole = Math.trunc(abs);
    const frac = Math.round((abs - whole) * 100);
    return sign * (BigInt(whole) * 100n + BigInt(frac));
  }

  const trimmed = String(value).trim().replace(/,/g, "");
  if (trimmed.length === 0) {
    return 0n;
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const parts = unsigned.split(".");
  const wholePart = parts[0]?.replace(/\D/g, "") || "0";
  let fracPart = (parts[1] ?? "00").replace(/\D/g, "");
  if (fracPart.length < 2) {
    fracPart = fracPart.padEnd(2, "0");
  } else if (fracPart.length > 2) {
    fracPart = fracPart.slice(0, 2);
  }

  const minor = BigInt(wholePart) * 100n + BigInt(fracPart || "0");
  return negative ? -minor : minor;
}