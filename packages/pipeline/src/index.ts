import { QUIMERA_CORE_VERSION } from "@quimera/core";

export const PIPELINE_MODULE = "pipeline" as const;

export type PipelineBootstrap = {
  readonly module: typeof PIPELINE_MODULE;
  readonly coreVersion: typeof QUIMERA_CORE_VERSION;
};

export function pipelineBootstrap(): PipelineBootstrap {
  return {
    module: PIPELINE_MODULE,
    coreVersion: QUIMERA_CORE_VERSION,
  };
}