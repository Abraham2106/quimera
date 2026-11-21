import { sha256CanonicalJson } from "@quimera/core";

import type { PipelineStepDef } from "./types.js";

export function computeStepInputHash(
  step: PipelineStepDef,
  upstreamOutputs: Readonly<Record<string, unknown>>,
): string {
  const deps = step.dependsOn ?? [];
  const depSlice: Record<string, unknown> = {};
  for (const dep of deps) {
    depSlice[dep] = upstreamOutputs[dep] ?? null;
  }
  return sha256CanonicalJson({
    stepId: step.id,
    config: step.config ?? {},
    upstream: depSlice,
  });
}