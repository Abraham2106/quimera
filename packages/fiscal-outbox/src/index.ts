import { QUIMERA_CORE_VERSION } from "@quimera/core";

export const FISCAL_OUTBOX_MODULE = "fiscal-outbox" as const;

export type FiscalOutboxBootstrap = {
  readonly module: typeof FISCAL_OUTBOX_MODULE;
  readonly coreVersion: typeof QUIMERA_CORE_VERSION;
};

export function fiscalOutboxBootstrap(): FiscalOutboxBootstrap {
  return {
    module: FISCAL_OUTBOX_MODULE,
    coreVersion: QUIMERA_CORE_VERSION,
  };
}