import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Package root (`packages/cr-api-passport`). */
export const PACKAGE_ROOT = path.resolve(here, "..");

export function passportsDir(): string {
  return path.join(PACKAGE_ROOT, "passports");
}

export function fixturesDir(): string {
  return path.join(PACKAGE_ROOT, "fixtures");
}