import { QUIMERA_CORE_VERSION } from "@quimera/core";

export const FACTURA_CI_MODULE = "factura-ci" as const;

export type FacturaCiBootstrap = {
  readonly module: typeof FACTURA_CI_MODULE;
  readonly coreVersion: typeof QUIMERA_CORE_VERSION;
};

export function facturaCiBootstrap(): FacturaCiBootstrap {
  return {
    module: FACTURA_CI_MODULE,
    coreVersion: QUIMERA_CORE_VERSION,
  };
}