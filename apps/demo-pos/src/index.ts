import { facturaCiBootstrap } from "@quimera/factura-ci";
import { fiscalOutboxBootstrap } from "@quimera/fiscal-outbox";

export const DEMO_POS_APP = "demo-pos" as const;

type HonoFramework = typeof import("hono").Hono;

export type DemoPosBootstrap = {
  readonly app: typeof DEMO_POS_APP;
  readonly linkedModules: readonly [string, string];
  readonly httpFramework: HonoFramework;
};

export function demoPosBootstrap(): DemoPosBootstrap {
  return {
    app: DEMO_POS_APP,
    linkedModules: [facturaCiBootstrap().module, fiscalOutboxBootstrap().module],
    httpFramework: undefined as unknown as HonoFramework,
  };
}