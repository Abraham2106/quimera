#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  FixedClock,
  InMemoryArtifactStore,
  MemoryLogger,
} from "@quimera/core";

import {
  createPipelineSql,
  getExecutionRun,
  listCheckpoints,
} from "./store/postgres.js";
import { isPipelineError } from "./errors.js";
import { parsePipelineManifest } from "./parse.js";
import {
  resumePipeline,
  runPipeline,
  validatePipelineDefinition,
} from "./runner.js";
import type {
  PipelineDefinition,
  RunContext,
  StepRegistry,
} from "./types.js";
import { createExodusOficiosRegistry } from "./demo-registry.js";
import { PIPELINE_EXIT_ERROR, PIPELINE_EXIT_SUCCESS } from "./types.js";

const HELP = `Usage: quimera-pipeline <command> [options]

Commands:
  validate  --manifest <path> [--registry <path>]  Validate DAG and contracts
  run       --manifest <path> --tenant <uuid> [--registry <path>] [--json]
  resume    --run <uuid> --manifest <path> --tenant <uuid> [--registry <path>]
            [--actor <id> --rationale <texto>] [--json]
  status    --run <uuid> --tenant <uuid> [--json]

Global:
  --json    Print structured JSON to stdout
`;

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printErr(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function loadManifest(path: string): Promise<PipelineDefinition> {
  const raw = await readFile(path, "utf8");
  return parsePipelineManifest(raw, path);
}

const TENANT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveTenantId(sql: ReturnType<typeof createPipelineSql>, tenant: string): Promise<string> {
  if (TENANT_UUID.test(tenant)) {
    const slug = `tenant-${tenant.slice(0, 8)}`;
    await sql`
      INSERT INTO qum_tenants (id, slug, display_name)
      VALUES (${tenant}::uuid, ${slug}, ${slug})
      ON CONFLICT (id) DO NOTHING
    `;
    return tenant;
  }
  const existing = await sql<{ id: string }[]>`
    SELECT id::text AS id FROM qum_tenants WHERE slug = ${tenant} LIMIT 1
  `;
  if (existing[0]) {
    return existing[0].id;
  }
  const id = randomUUID();
  await sql`
    INSERT INTO qum_tenants (id, slug, display_name)
    VALUES (${id}::uuid, ${tenant}, ${tenant})
  `;
  return id;
}

async function loadRegistry(path: string | undefined): Promise<StepRegistry> {
  if (!path) {
    return createExodusOficiosRegistry();
  }
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as StepRegistry;
  return parsed;
}

function minimalContext(tenantId: string): RunContext {
  return {
    tenantId,
    correlationId: "cli",
    stepContext: {
      tenantId,
      correlationId: "cli",
      clock: new FixedClock(new Date()),
      logger: new MemoryLogger(),
      artifacts: new InMemoryArtifactStore(),
    },
  };
}

export async function runCli(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printErr(HELP);
    return PIPELINE_EXIT_SUCCESS;
  }

  const command = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const sql = createPipelineSql();

  try {
    if (command === "validate") {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          manifest: { type: "string" },
          registry: { type: "string" },
          json: { type: "boolean", default: false },
        },
      });
      const manifestPath = values.manifest ?? positionals[0];
      if (!manifestPath) {
        printErr("validate requires --manifest");
        return PIPELINE_EXIT_ERROR;
      }
      const definition = await loadManifest(manifestPath);
      const registry = await loadRegistry(values.registry);
      const result = validatePipelineDefinition(definition, registry);
      if (json) {
        printJson(result);
      } else if (result.valid) {
        printErr(`OK — topological order: ${result.order.join(" → ")}`);
      } else {
        printErr(`${result.error.code}: ${result.error.message}`);
      }
      return result.valid ? PIPELINE_EXIT_SUCCESS : PIPELINE_EXIT_ERROR;
    }

    if (command === "run") {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          manifest: { type: "string" },
          tenant: { type: "string" },
          registry: { type: "string" },
          json: { type: "boolean", default: false },
        },
      });
      const manifestPath = values.manifest ?? positionals[0];
      if (!manifestPath || !values.tenant) {
        printErr("run requires --manifest and --tenant");
        return PIPELINE_EXIT_ERROR;
      }
      const definition = await loadManifest(manifestPath);
      const registry = await loadRegistry(values.registry);
      const tenantId = await resolveTenantId(sql, values.tenant);
      const outcome = await runPipeline(sql, {
        definition,
        registry,
        context: minimalContext(tenantId),
      });
      if (json) printJson(outcome);
      else printErr(`run ${outcome.runId} → ${outcome.status} (exit ${outcome.exitCode})`);
      return outcome.exitCode;
    }

    if (command === "resume") {
      const { values } = parseArgs({
        args: rest,
        options: {
          run: { type: "string" },
          manifest: { type: "string" },
          tenant: { type: "string" },
          registry: { type: "string" },
          actor: { type: "string" },
          rationale: { type: "string" },
          json: { type: "boolean", default: false },
        },
      });
      if (!values.run || !values.manifest || !values.tenant) {
        printErr("resume requires --run, --manifest and --tenant");
        return PIPELINE_EXIT_ERROR;
      }
      if (values.actor && !values.rationale) {
        printErr("resume --actor requires --rationale");
        return PIPELINE_EXIT_ERROR;
      }
      const definition = await loadManifest(values.manifest);
      const registry = await loadRegistry(values.registry);
      const tenantId = await resolveTenantId(sql, values.tenant);
      const outcome = await resumePipeline(sql, {
        runId: values.run,
        definition,
        registry,
        context: minimalContext(tenantId),
        ...(values.actor
          ? {
              humanDecision: {
                actorId: values.actor,
                rationale: values.rationale!,
              },
            }
          : {}),
      });
      if (json) printJson(outcome);
      else printErr(`resume ${outcome.runId} → ${outcome.status} (exit ${outcome.exitCode})`);
      return outcome.exitCode;
    }

    if (command === "status") {
      const { values } = parseArgs({
        args: rest,
        options: {
          run: { type: "string" },
          tenant: { type: "string" },
        },
      });
      if (!values.run || !values.tenant) {
        printErr("status requires --run and --tenant");
        return PIPELINE_EXIT_ERROR;
      }
      const tenantId = await resolveTenantId(sql, values.tenant);
      const run = await getExecutionRun(sql, tenantId, values.run);
      const checkpoints = await listCheckpoints(sql, tenantId, values.run);
      const payload = { run, checkpoints };
      if (json) printJson(payload);
      else {
        printErr(run ? `run ${run.id} status=${run.status}` : "run not found");
        for (const cp of checkpoints) {
          printErr(`  ${cp.stepId}: ${cp.status} attempts=${cp.attemptCount}`);
        }
      }
      return PIPELINE_EXIT_SUCCESS;
    }

    printErr(`Unknown command: ${command}\n${HELP}`);
    return PIPELINE_EXIT_ERROR;
  } catch (err) {
    const message = isPipelineError(err)
      ? `${err.code}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
  printErr(message);
    if (json) {
      printJson({
        ok: false,
        error: isPipelineError(err)
          ? { code: err.code, message: err.message }
          : { message },
      });
    }
    return PIPELINE_EXIT_ERROR;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

const isMain =
  process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js");

if (isMain) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}