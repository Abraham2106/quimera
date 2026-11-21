import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packages = [
  "core",
  "data-exodus",
  "cr-api-passport",
  "fiscal-outbox",
  "factura-ci",
  "pipeline",
];

const forbidden = [
  /@quimera\/adapter-clairic/,
  /@quimera\/oficios/,
  /from\s+["'][^"']*apps\/oficios/,
  /make-no-mistakes-toolkit/,
  /claude-code-waypoint/,
];

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

let failed = 0;
for (const name of packages) {
  const dir = path.join(root, "packages", name);
  const files = await walk(dir);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        console.error(`ISOLATION ${name}: ${path.relative(root, file)} matches ${pattern}`);
        failed += 1;
      }
    }
  }
}

const oficiosFiles = await walk(path.join(root, "apps", "oficios"));
for (const file of oficiosFiles) {
  const text = await readFile(file, "utf8");
  if (/@quimera\/adapter-clairic/.test(text)) {
    console.error(`ISOLATION oficios imports clairic: ${path.relative(root, file)}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`isolation failed: ${failed}`);
  process.exit(1);
}
console.log("isolation ok: packages do not import OficiOS, Clairic, or excluded Dojo tools");
