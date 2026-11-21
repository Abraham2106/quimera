import { parseArgs } from "node:util";
import type { PassportCapabilities } from "./capabilities.js";
import { getCapabilities } from "./capabilities.js";
import { loadAllPassports, getPassportById } from "./registry.js";
import { PassportClient } from "./client/passport-client.js";
import { exitCodeForError, PASSPORT_ERROR_CODES } from "./errors.js";
import { verifyPassport, driftToQuimeraError } from "./verify/verify.js";
import { generatePassportAdapter } from "./generate/generate.js";

export type CliRunResult = {
  readonly exitCode: number;
  readonly payload?: unknown;
};

function parseParamFlags(rest: string[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (const item of rest) {
    if (item.startsWith("--param")) {
      const eq = item.indexOf("=");
      const chunk = eq >= 0 ? item.slice(eq + 1) : rest[rest.indexOf(item) + 1];
      if (chunk && chunk.includes("=")) {
        const [k, ...v] = chunk.split("=");
        params[k!] = v.join("=");
      }
    } else if (item.includes("=") && !item.startsWith("--")) {
      const [k, ...v] = item.split("=");
      params[k!] = v.join("=");
    }
  }
  return params;
}

function extractMode(args: { mode?: string; values: Record<string, unknown> }): string {
  const m = args.values["mode"];
  if (typeof m === "string") {
    return m;
  }
  return "fixture";
}

export async function runCli(argv: string[]): Promise<CliRunResult> {
  if (argv.includes("--capabilities")) {
  const caps: PassportCapabilities = getCapabilities();
    return { exitCode: 0, payload: argv.includes("--json") ? caps : caps };
  }

  const parsed = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
      capabilities: { type: "boolean", default: false },
      mode: { type: "string" },
      all: { type: "boolean", default: false },
      out: { type: "string" },
      operation: { type: "string" },
      param: { type: "string", multiple: true },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  const json = Boolean(parsed.values.json);
  const [command, passportId, ...rest] = parsed.positionals;

  if (!command || parsed.values.help) {
    return {
      exitCode: 2,
      payload: json
        ? { error: "usage", message: "quimera-passport <list|inspect|query|verify|generate> ..." }
        : undefined,
    };
  }

  const mode = extractMode({ values: parsed.values });

  try {
    switch (command) {
      case "list": {
        const passports = await loadAllPassports();
        const payload = passports.map((p) => ({
          id: p.passportId,
          version: p.passportVersion,
          status: p.status,
          authType: p.auth.type,
          credentialsRequired: p.auth.credentialsRequired,
          executable: p.executable,
          accessTier: p.accessTier ?? null,
          lastVerifiedAt: p.provider.lastVerifiedAt,
        }));
        return { exitCode: 0, payload };
      }
      case "inspect": {
        if (!passportId) {
          return { exitCode: 2, payload: { error: "missing passportId" } };
        }
        const p = await getPassportById(passportId);
        if (!p) {
          return { exitCode: 1, payload: { error: "passport not found", passportId } };
        }
        return { exitCode: 0, payload: p };
      }
      case "query": {
        if (!passportId) {
          return { exitCode: 2, payload: { error: "missing passportId" } };
        }
        const p = await getPassportById(passportId);
        if (!p) {
          return { exitCode: 1, payload: { error: "passport not found" } };
        }
        const operation =
          (parsed.values.operation as string | undefined) ??
          rest.find((r) => !r.startsWith("--")) ??
          Object.keys(p.operations)[0];
        if (!operation) {
          return { exitCode: 2, payload: { error: "missing operation" } };
        }
        const paramList = (parsed.values.param as string[] | undefined) ?? [];
        const params = {
          ...parseParamFlags(rest),
          ...parseParamFlags(paramList.map((p) => `--param=${p}`)),
        };
        const client = new PassportClient({ mode });
        const res = await client.query(p, operation, params);
        if (!res.ok) {
          return { exitCode: exitCodeForError(res.error.code), payload: res };
        }
        return { exitCode: 0, payload: res };
      }
      case "verify": {
        const client = new PassportClient({ mode });
        if (parsed.values.all) {
          const passports = await loadAllPassports();
          const reports = [];
          let exit = 0;
          for (const p of passports) {
            if (!p.executable) {
              continue;
            }
            const report = await verifyPassport(p, { client });
            reports.push(report);
            if (report.status === "DRIFT_DETECTED") {
              exit = 5;
            }
          }
          return { exitCode: exit, payload: reports };
        }
        if (!passportId) {
          return { exitCode: 2, payload: { error: "missing passportId or --all" } };
        }
        const p = await getPassportById(passportId);
        if (!p) {
          return { exitCode: 1, payload: { error: "passport not found" } };
        }
        const report = await verifyPassport(p, { client });
        if (report.status === "DRIFT_DETECTED") {
          return { exitCode: 5, payload: { report, error: driftToQuimeraError(report) } };
        }
        return { exitCode: 0, payload: report };
      }
      case "generate": {
        if (!passportId) {
          return { exitCode: 2, payload: { error: "missing passportId" } };
        }
        const out = parsed.values.out as string | undefined;
        if (!out) {
          return { exitCode: 2, payload: { error: "missing --out directory" } };
        }
        const p = await getPassportById(passportId);
        if (!p) {
          return { exitCode: 1, payload: { error: "passport not found" } };
        }
        const generated = await generatePassportAdapter(p, out);
        return { exitCode: 0, payload: generated };
      }
      default:
        return { exitCode: 2, payload: { error: `unknown command: ${command}` } };
    }
  } catch (err) {
    return {
      exitCode: 1,
      payload: {
        error: err instanceof Error ? err.message : String(err),
        code: PASSPORT_ERROR_CODES.UPSTREAM_UNAVAILABLE,
      },
    };
  }
}

export async function runCliMain(argv: string[]): Promise<number> {
  const json = argv.includes("--json");
  const result = await runCli(argv);

  if (json) {
    process.stdout.write(`${JSON.stringify(result.payload ?? { exitCode: result.exitCode }, null, 2)}\n`);
  } else if (result.payload !== undefined && result.exitCode === 0) {
    process.stdout.write(`${JSON.stringify(result.payload, null, 2)}\n`);
  } else if (result.exitCode !== 0 && result.payload) {
    process.stderr.write(`${JSON.stringify(result.payload, null, 2)}\n`);
  }

  return result.exitCode;
}