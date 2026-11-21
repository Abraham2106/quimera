import type * as ZodModule from "zod";

/** Placeholder de bootstrap WBS-1.1; contratos canónicos en WBS-1.2. */
export const QUIMERA_CORE_VERSION = "0.0.0" as const;

export type QuimeraCoreBootstrap = {
  readonly version: typeof QUIMERA_CORE_VERSION;
  readonly zodModule: typeof ZodModule;
};

export function coreBootstrap(): QuimeraCoreBootstrap {
  return {
    version: QUIMERA_CORE_VERSION,
    zodModule: undefined as unknown as typeof ZodModule,
  };
}