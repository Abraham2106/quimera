import { QUIMERA_CORE_VERSION } from "@quimera/core";

export const DATA_EXODUS_MODULE = "data-exodus" as const;

export type DataExodusBootstrap = {
  readonly module: typeof DATA_EXODUS_MODULE;
  readonly coreVersion: typeof QUIMERA_CORE_VERSION;
};

export function dataExodusBootstrap(): DataExodusBootstrap {
  return {
    module: DATA_EXODUS_MODULE,
    coreVersion: QUIMERA_CORE_VERSION,
  };
}