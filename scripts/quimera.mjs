#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function log(event, extra = {}) {
  process.stderr.write(`${JSON.stringify({ event, ...extra })}\n`);
}

function runTsx(script, args) {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["exec", "tsx", script, ...args], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const [group, ...rest] = process.argv.slice(2);

if (!group || group === "--help" || group === "-h") {
  log("help", {
    message:
      "quimera <pipeline|passport|factura-ci|exodus> ...  (--json deja el resultado en stdout)",
  });
  process.exit(0);
}

if (group === "exodus" && rest[0] === "decisions" && rest[1] === "apply") {
  const fileFlag = rest.indexOf("--file");
  const file = fileFlag >= 0 ? rest[fileFlag + 1] : "decisions-demo.yaml";
  if (!file) {
    log("error", { message: "decisions apply requiere --file" });
    process.exit(2);
  }
  const target = path.resolve(root, file);
  const raw = await readFile(target, "utf8");
  if (!raw.includes("status:")) {
    log("error", { message: "el archivo no tiene status" });
    process.exit(2);
  }
  const next = raw.replace(/^status:\s*\S+\s*$/m, "status: APPLIED");
  await writeFile(target, next, "utf8");
  const payload = { ok: true, file: path.relative(root, target), status: "APPLIED" };
  if (rest.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    log("decisions.apply", payload);
  }
  process.exit(0);
}

const scripts = {
  pipeline: "packages/pipeline/src/cli.ts",
  passport: "packages/cr-api-passport/src/cli-main.ts",
  "factura-ci": "packages/factura-ci/src/cli.ts",
};

const script = scripts[group];
if (!script) {
  log("error", { message: `comando desconocido: ${group}` });
  process.exit(2);
}

log("cli.start", { group, json: rest.includes("--json") });
const code = await runTsx(script, rest);
log("cli.exit", { group, code });
process.exit(code);
