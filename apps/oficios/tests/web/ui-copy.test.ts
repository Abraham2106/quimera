import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const webSrcDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/src",
);

const REQUIRED_STRINGS = [
  "Cliente",
  "Equipo",
  "Orden de servicio",
  "Presupuesto",
  "Aprobación del cliente",
  "Repuestos",
  "Factura",
  "¿De dónde viene este dato?",
  "No se puede iniciar ni cerrar esta orden todavía: falta registrar la aprobación del presupuesto por parte del cliente",
  "Registrar aprobación del cliente",
] as const;

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(full)));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("UI copy — español CR taller HVAC", () => {
  it("incluye textos obligatorios y evita dangerouslySetInnerHTML", async () => {
    const files = await collectSourceFiles(webSrcDir);
    expect(files.length).toBeGreaterThan(0);

    const chunks = await Promise.all(files.map((f) => readFile(f, "utf8")));
    const source = chunks.join("\n");

    for (const phrase of REQUIRED_STRINGS) {
      expect(source, `falta: ${phrase}`).toContain(phrase);
    }

    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});