import { PipelineRetriesSchema } from "./schemas.js";
import type { PipelineDefinition } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRetries(value: Record<string, unknown>, stepId: string) {
  const parsed = PipelineRetriesSchema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "retries"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Step "${stepId}" has invalid retries — ${detail}`);
  }
  return parsed.data;
}

export function parsePipelineJson(raw: string): PipelineDefinition {
  const parsed: unknown = JSON.parse(raw);
  return normalizePipelineDefinition(parsed);
}

export async function parsePipelineManifest(
  raw: string,
  filename?: string,
): Promise<PipelineDefinition> {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return parsePipelineJson(trimmed);
  }
  const isYaml =
    filename?.endsWith(".yaml") ||
    filename?.endsWith(".yml") ||
    trimmed.startsWith("pipelineId:");
  if (isYaml) {
    const { parse: parseYaml } = await import("yaml");
    const parsed = parseYaml(raw) as unknown;
    return normalizePipelineDefinition(parsed);
  }
  return parsePipelineJson(trimmed);
}

export function normalizePipelineDefinition(parsed: unknown): PipelineDefinition {
  if (!isRecord(parsed)) {
    throw new Error("Pipeline manifest must be an object");
  }
  const pipelineId = String(parsed.pipelineId ?? parsed.id ?? "");
  const pipelineVersion = String(parsed.pipelineVersion ?? "1.0.0");
  if (!pipelineId) {
    throw new Error("Pipeline manifest missing pipelineId");
  }
  const stepsRaw = parsed.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new Error("Pipeline manifest must include at least one step");
  }
  const steps = stepsRaw.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Step at index ${index} must be an object`);
    }
    const id = String(item.id ?? "");
    const uses = String(item.uses ?? "");
    if (!id || !uses) {
      throw new Error(`Step at index ${index} requires id and uses`);
    }
    return {
      id,
      uses,
      contractVersion: String(item.contractVersion ?? "^1.0.0"),
      idempotent: Boolean(item.idempotent ?? true),
      dependsOn: Array.isArray(item.dependsOn)
        ? item.dependsOn.map(String)
        : undefined,
      gate: item.gate === "human_review" ? ("human_review" as const) : undefined,
      config: isRecord(item.config) ? item.config : undefined,
      retries: isRecord(item.retries)
        ? parseRetries(item.retries, id)
        : undefined,
    };
  });
  return {
    pipelineId,
    pipelineVersion,
    contractVersion:
      typeof parsed.contractVersion === "string"
        ? parsed.contractVersion
        : undefined,
    steps,
  };
}