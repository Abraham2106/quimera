import { ERR_PIPELINE_INVALID_DAG, PipelineError } from "./errors.js";
import type { PipelineDefinition, PipelineStepDef } from "./types.js";

export function topoSort(stepDefs: readonly PipelineStepDef[]): string[] {
  const byId = new Map(stepDefs.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const step of stepDefs) {
    inDegree.set(step.id, 0);
    adj.set(step.id, []);
  }

  for (const step of stepDefs) {
    const deps = step.dependsOn ?? [];
    for (const dep of deps) {
      if (!byId.has(dep)) {
        throw new PipelineError(
          ERR_PIPELINE_INVALID_DAG,
          `Step "${step.id}" depends on missing step "${dep}"`,
        );
      }
      adj.get(dep)!.push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
    }
  }
  queue.sort((a, b) => a.localeCompare(b));

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    const neighbors = adj.get(node) ?? [];
    for (const next of neighbors) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  if (order.length !== stepDefs.length) {
    throw new PipelineError(
      ERR_PIPELINE_INVALID_DAG,
      "Pipeline DAG contains a cycle",
    );
  }

  return order;
}

export function validateDag(definition: PipelineDefinition): string[] {
  const ids = new Set<string>();
  for (const step of definition.steps) {
    if (ids.has(step.id)) {
      throw new PipelineError(
        ERR_PIPELINE_INVALID_DAG,
        `Duplicate step id "${step.id}"`,
      );
    }
    ids.add(step.id);
  }
  return topoSort(definition.steps);
}