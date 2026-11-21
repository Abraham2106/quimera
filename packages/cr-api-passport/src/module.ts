import { QUIMERA_CORE_VERSION } from "@quimera/core";

export const CR_API_PASSPORT_MODULE = "cr-api-passport" as const;

export type CrApiPassportBootstrap = {
  readonly module: typeof CR_API_PASSPORT_MODULE;
  readonly coreVersion: typeof QUIMERA_CORE_VERSION;
};

export function crApiPassportBootstrap(): CrApiPassportBootstrap {
  return {
    module: CR_API_PASSPORT_MODULE,
    coreVersion: QUIMERA_CORE_VERSION,
  };
}