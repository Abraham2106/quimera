import { mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Extensiones de código fuente que pueden contener imports prohibidos. */
export const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

export const forbidden = [
  /@quimera\/adapter-clairic/,
  /@quimera\/oficios/,
  /from\s+["'][^"']*apps\/oficios/,
  /make-no-mistakes-toolkit/,
  /claude-code-waypoint/,
];

/** Paquetes que son el origen de las reglas; no se despliegan para verificarlas. */
const FORBIDDEN_PACKAGE_NAMES = new Set([
  "@quimera/adapter-clairic",
  "@quimera/oficios",
]);

/**
 * Recorre un árbol siguiendo symlinks (sin ciclos) y devuelve los archivos de
 * código fuente. `visited` usa realpath para no recorrer dos veces un destino.
 */
export async function walk(dir, out = [], visited = new Set()) {
  let canonical;
  try {
    canonical = await realpath(dir);
  } catch {
    return out;
  }
  if (visited.has(canonical)) {
    return out;
  }
  visited.add(canonical);

  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const target = await stat(full);
        isDirectory = target.isDirectory();
        isFile = target.isFile();
      } catch {
        continue;
      }
    }
    if (isDirectory) {
      await walk(full, out, visited);
    } else if (isFile && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

/** Lee los patrones de `packages:` del pnpm-workspace.yaml sin dependencias YAML. */
export async function readWorkspacePatterns(workspaceRoot = root) {
  const yaml = await readFile(path.join(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
  const patterns = [];
  let inPackages = false;
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line === "packages:") {
      inPackages = true;
      continue;
    }
    if (!line.startsWith("-")) {
      inPackages = false;
      continue;
    }
    if (!inPackages) {
      continue;
    }
    const value = line.slice(1).trim().replace(/^["']|["']$/g, "");
    if (value) {
      patterns.push(value);
    }
  }
  return patterns;
}

/**
 * Descubre los paquetes del workspace a partir de pnpm-workspace.yaml.
 * Cada patrón `base/*` se expande leyendo los package.json de `base`.
 */
export async function discoverWorkspacePackages(workspaceRoot = root) {
  const patterns = await readWorkspacePatterns(workspaceRoot);
  const packages = [];
  for (const pattern of patterns) {
    const base = pattern.split("*")[0].replace(/[\\/]+$/, "");
    if (!base || base.includes("*") || path.isAbsolute(base)) {
      continue;
    }
    const baseDir = path.join(workspaceRoot, base);
    let entries = [];
    try {
      entries = await readdir(baseDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const packageJsonPath = path.join(baseDir, entry.name, "package.json");
      let manifest;
      try {
        manifest = JSON.parse(await readFile(packageJsonPath, "utf8"));
      } catch {
        continue;
      }
      if (typeof manifest.name !== "string") {
        continue;
      }
      packages.push({
        name: manifest.name,
        shortName: manifest.name.replace(/^@quimera\//, ""),
        dir: path.join(baseDir, entry.name),
        base,
      });
    }
  }
  return packages;
}

export async function treeHasForbidden(dir) {
  const hits = [];
  async function visit(current, visited = new Set()) {
    let canonical;
    try {
      canonical = await realpath(current);
    } catch {
      return;
    }
    if (visited.has(canonical)) {
      return;
    }
    visited.add(canonical);

    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      let isDirectory = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          isDirectory = (await stat(full)).isDirectory();
        } catch {
          continue;
        }
      }
      if (entry.name === "@quimera") {
        let names = [];
        try {
          names = await readdir(full);
        } catch {
          names = [];
        }
        for (const pkg of names) {
          if (pkg === "oficios" || pkg === "adapter-clairic") {
            hits.push(path.join(full, pkg));
          }
        }
      }
      if (isDirectory && entry.name !== ".bin" && !SKIP_DIRS.has(entry.name)) {
        await visit(full, visited);
      }
    }
  }
  await visit(dir);
  return hits;
}

export async function main() {
  const packages = (await discoverWorkspacePackages()).filter(
    (pkg) => !FORBIDDEN_PACKAGE_NAMES.has(pkg.name),
  );
  let failed = 0;

  for (const pkg of packages) {
    const files = await walk(pkg.dir);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(text)) {
          console.error(`ISOLATION ${pkg.shortName}: ${path.relative(root, file)} matches ${pattern}`);
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

  for (const pkg of packages) {
    const dest = await mkdtemp(path.join(os.tmpdir(), `quimera-iso-${pkg.shortName}-`));
    const result = spawnSync(
      "pnpm",
      ["--filter", pkg.name, "deploy", dest, "--legacy", "--prod"],
      { cwd: root, encoding: "utf8" },
    );
    if (result.status !== 0) {
      console.error(`ISOLATION deploy ${pkg.name} failed`);
      console.error(result.stdout);
      console.error(result.stderr);
      failed += 1;
      await rm(dest, { recursive: true, force: true });
      continue;
    }
    const hits = await treeHasForbidden(dest);
    if (hits.length > 0) {
      console.error(`ISOLATION ${pkg.name} installed forbidden packages:`);
      for (const hit of hits) {
        console.error(`  ${hit}`);
      }
      failed += 1;
    } else {
      console.log(`isolation install ok: ${pkg.name}`);
    }
    await rm(dest, { recursive: true, force: true });
  }

  if (failed > 0) {
    console.error(`isolation failed: ${failed}`);
    process.exitCode = 1;
    return;
  }
  console.log("isolation ok: each @quimera/* installs without OficiOS or Clairic");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
