import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ApiPassportSchema, type ApiPassport } from "./schema/api-passport.js";
import { passportsDir } from "./paths.js";

export async function loadPassportFromFile(filePath: string): Promise<ApiPassport> {
  const raw = await readFile(filePath, "utf8");
  const doc = parseYaml(raw) as unknown;
  return ApiPassportSchema.parse(doc);
}

export async function listPassportFiles(): Promise<string[]> {
  const dir = passportsDir();
  const entries = await readdir(dir);
  return entries
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .map((name) => path.join(dir, name))
    .sort();
}

export async function loadAllPassports(): Promise<ApiPassport[]> {
  const files = await listPassportFiles();
  return Promise.all(files.map((f) => loadPassportFromFile(f)));
}

export async function getPassportById(passportId: string): Promise<ApiPassport | undefined> {
  const files = await listPassportFiles();
  for (const file of files) {
    const p = await loadPassportFromFile(file);
    if (p.passportId === passportId) {
      return p;
    }
  }
  return undefined;
}

export function passportIsQueryable(passport: ApiPassport): boolean {
  return passport.executable !== false && Object.keys(passport.operations).length > 0;
}