import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

async function treeHasForbidden(dir) {
  const hits = [];
  async function visit(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.name === "@quimera") {
        const names = await readdir(full);
        for (const pkg of names) {
          if (pkg === "oficios" || pkg === "adapter-clairic") hits.push(path.join(full, pkg));
        }
      }
      if (entry.isDirectory() && entry.name !== ".bin") await visit(full);
    }
  }
  await visit(dir);
  return hits;
}

for (const name of packages) {
  const dest = await mkdtemp(path.join(os.tmpdir(), `quimera-iso-${name}-`));
  const result = spawnSync(
    "pnpm",
    ["--filter", `@quimera/${name}`, "deploy", dest, "--legacy", "--prod"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(`ISOLATION deploy @quimera/${name} failed`);
    console.error(result.stdout);
    console.error(result.stderr);
    failed += 1;
    await rm(dest, { recursive: true, force: true });
    continue;
  }
  const hits = await treeHasForbidden(dest);
  if (hits.length > 0) {
    console.error(`ISOLATION @quimera/${name} installed forbidden packages:`);
    for (const hit of hits) console.error(`  ${hit}`);
    failed += 1;
  } else {
    console.log(`isolation install ok: @quimera/${name}`);
  }
  await rm(dest, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`isolation failed: ${failed}`);
  process.exit(1);
}
console.log("isolation ok: each @quimera/* installs without OficiOS or Clairic");
