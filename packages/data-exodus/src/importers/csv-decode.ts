import type { CsvDelimiter } from "./types.js";

export type CsvEncoding = "utf-8" | "utf-8-bom" | "latin1";

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

export function decodeCsvBytes(bytes: Uint8Array): {
  text: string;
  encoding: CsvEncoding;
} {
  if (
    bytes.length >= 3 &&
    bytes[0] === UTF8_BOM[0] &&
    bytes[1] === UTF8_BOM[1] &&
    bytes[2] === UTF8_BOM[2]
  ) {
    const text = new TextDecoder("utf-8").decode(bytes.subarray(3));
    return { text, encoding: "utf-8-bom" };
  }

  const utf8Strict = new TextDecoder("utf-8", { fatal: true });
  try {
    const text = utf8Strict.decode(bytes);
    return { text, encoding: "utf-8" };
  } catch {
    const text = Buffer.from(bytes).toString("latin1");
    return { text, encoding: "latin1" };
  }
}

export function detectDelimiter(sample: string): CsvDelimiter {
  const lines = sample
    .split(/\r?\n/)
    .slice(0, 8)
    .filter((line) => line.trim().length > 0);
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  for (const line of lines) {
    commas += (line.match(/,/g) ?? []).length;
    semicolons += (line.match(/;/g) ?? []).length;
    tabs += (line.match(/\t/g) ?? []).length;
  }
  if (tabs > 0 && tabs >= semicolons && tabs >= commas) {
    return "\t";
  }
  if (semicolons > commas && semicolons > 0) {
    return ";";
  }
  return ",";
}

export function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
      suspicious += 1;
    }
  }
  return suspicious > sample.length * 0.1;
}