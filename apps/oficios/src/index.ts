import { QUIMERA_CORE_VERSION } from "@quimera/core";
import { dataExodusBootstrap } from "@quimera/data-exodus";
import { crApiPassportBootstrap } from "@quimera/cr-api-passport";
import { fiscalOutboxBootstrap } from "@quimera/fiscal-outbox";

export const OFICIOS_APP = "oficios" as const;

type HonoFramework = typeof import("hono").Hono;

export type OficiosBootstrap = {
  readonly app: typeof OFICIOS_APP;
  readonly coreVersion: typeof QUIMERA_CORE_VERSION;
  readonly linkedModules: readonly [string, string, string];
  readonly httpFramework: HonoFramework;
};

export function oficiosBootstrap(): OficiosBootstrap {
  const exodus = dataExodusBootstrap();
  return {
    app: OFICIOS_APP,
    coreVersion: exodus.coreVersion,
    linkedModules: [
      exodus.module,
      crApiPassportBootstrap().module,
      fiscalOutboxBootstrap().module,
    ],
    httpFramework: undefined as unknown as HonoFramework,
  };
}