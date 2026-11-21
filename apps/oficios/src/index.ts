import { Hono } from "hono";

import { QUIMERA_CORE_VERSION } from "@quimera/core";
import { dataExodusBootstrap } from "@quimera/data-exodus";
import { crApiPassportBootstrap } from "@quimera/cr-api-passport";
import { fiscalOutboxBootstrap } from "@quimera/fiscal-outbox";

export { createApp, type CreateAppOptions } from "./api/app.js";

export const OFICIOS_APP = "oficios" as const;

export {
  HVAC_REFRIGERATION_V1_CONTRACT_ID,
  type HvacRefrigerationV1ContractId,
} from "./domain/hvac-refrigeration-v1.js";
export {
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
  isTerminalWorkOrderStatus,
} from "./domain/work-order-status.js";
export {
  ERR_WORK_ORDER_APPROVAL_REQUIRED,
  ERR_WORK_ORDER_INVALID_TRANSITION,
  ERR_WORK_ORDER_VERSION_MISMATCH,
  type WorkOrderFsmErrorCode,
} from "./domain/work-order-errors.js";
export {
  getAllowedTransitions,
  transitionWorkOrder,
  walkHvacHappyPath,
  type WorkOrderTransitionContext,
  type WorkOrderTransitionFailure,
  type WorkOrderTransitionResult,
  type WorkOrderTransitionSuccess,
} from "./domain/work-order-fsm.js";

type HonoFramework = typeof Hono;

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
    httpFramework: Hono,
  };
}