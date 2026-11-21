import { isContractCompatible } from "@quimera/core";

import { validateDag } from "./dag.js";
import { ERR_PIPELINE_CONTRACT_MISMATCH, PipelineError } from "./errors.js";
import type {
  PipelineDefinition,
  PipelineStepDef,
  StepRegistry,
} from "./types.js";

function resolveRegistry(
  registry: StepRegistry,
  step: PipelineStepDef,
): NonNullable<StepRegistry[string]> {
  const entry = registry[step.uses];
  if (!entry) {
    throw new PipelineError(
      ERR_PIPELINE_CONTRACT_MISMATCH,
      `Step "${step.id}" uses unknown module step "${step.uses}"`,
    );
  }
  return entry;
}

export function validateStepContracts(
  definition: PipelineDefinition,
  registry: StepRegistry,
): void {
  const byId = new Map(definition.steps.map((s) => [s.id, s]));

  for (const step of definition.steps) {
    const consumer = resolveRegistry(registry, step);
    const deps = step.dependsOn ?? [];
    for (const depId of deps) {
      const depStep = byId.get(depId);
      if (!depStep) {
        continue;
      }
      const producer = resolveRegistry(registry, depStep);
      if (producer.outputContract.name !== consumer.inputContract.name) {
        throw new PipelineError(
          ERR_PIPELINE_CONTRACT_MISMATCH,
          `Contract name mismatch on edge ${depId} → ${step.id}: ` +
            `${producer.outputContract.name} vs ${consumer.inputContract.name}`,
        );
      }
      if (
        !isContractCompatible(
          producer.outputContract.version,
          step.contractVersion,
        )
      ) {
        throw new PipelineError(
          ERR_PIPELINE_CONTRACT_MISMATCH,
          `Contract version incompatible on edge ${depId} → ${step.id}: ` +
            `producer ${producer.outputContract.version} does not satisfy ${step.contractVersion}`,
        );
      }
    }
  }
}

export function validateDagAndContracts(
  definition: PipelineDefinition,
  registry: StepRegistry,
): string[] {
  const order = validateDag(definition);
  validateStepContracts(definition, registry);
  return order;
}