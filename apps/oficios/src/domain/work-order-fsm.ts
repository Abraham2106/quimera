import {
  ERR_WORK_ORDER_APPROVAL_REQUIRED,
  ERR_WORK_ORDER_INVALID_TRANSITION,
  ERR_WORK_ORDER_VERSION_MISMATCH,
  type WorkOrderFsmErrorCode,
} from "./work-order-errors.js";
import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "./hvac-refrigeration-v1.js";
import {
  isTerminalWorkOrderStatus,
  type WorkOrderStatus,
} from "./work-order-status.js";

const HVAC_TRANSITIONS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderStatus[]>
> = {
  RECEIVED: ["DIAGNOSED", "CANCELLED"],
  DIAGNOSED: ["QUOTED", "CANCELLED"],
  QUOTED: ["APPROVED", "CANCELLED"],
  APPROVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["VERIFIED"],
  VERIFIED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export type WorkOrderTransitionContext = {
  readonly tradeContractId: string;
  readonly currentStatus: WorkOrderStatus;
  readonly targetStatus: WorkOrderStatus;
  readonly customerAuthorized: boolean;
  readonly expectedVersion: number;
  readonly actualVersion: number;
};

export type WorkOrderTransitionSuccess = {
  readonly ok: true;
  readonly nextStatus: WorkOrderStatus;
  readonly nextVersion: number;
  readonly customerAuthorized: boolean;
};

export type WorkOrderTransitionFailure = {
  readonly ok: false;
  readonly code: WorkOrderFsmErrorCode;
  readonly httpStatus: 409;
  readonly currentStatus: WorkOrderStatus;
  readonly targetStatus: WorkOrderStatus;
  readonly allowedTransitions: readonly WorkOrderStatus[];
};

export type WorkOrderTransitionResult =
  | WorkOrderTransitionSuccess
  | WorkOrderTransitionFailure;

export function getAllowedTransitions(
  status: WorkOrderStatus,
): readonly WorkOrderStatus[] {
  return HVAC_TRANSITIONS[status];
}

function requiresCustomerApproval(
  currentStatus: WorkOrderStatus,
  targetStatus: WorkOrderStatus,
  customerAuthorized: boolean,
): boolean {
  if (targetStatus !== "IN_PROGRESS" && targetStatus !== "CLOSED") {
    return false;
  }
  if (
    currentStatus === "QUOTED" &&
    (targetStatus === "IN_PROGRESS" || targetStatus === "CLOSED")
  ) {
    return true;
  }
  if (targetStatus === "IN_PROGRESS" && !customerAuthorized) {
    return true;
  }
  if (targetStatus === "CLOSED" && !customerAuthorized) {
    return true;
  }
  return false;
}

export function transitionWorkOrder(
  ctx: WorkOrderTransitionContext,
): WorkOrderTransitionResult {
  const allowed = getAllowedTransitions(ctx.currentStatus);

  if (ctx.tradeContractId !== HVAC_REFRIGERATION_V1_CONTRACT_ID) {
    return {
      ok: false,
      code: ERR_WORK_ORDER_INVALID_TRANSITION,
      httpStatus: 409,
      currentStatus: ctx.currentStatus,
      targetStatus: ctx.targetStatus,
      allowedTransitions: allowed,
    };
  }

  if (ctx.expectedVersion !== ctx.actualVersion) {
    return {
      ok: false,
      code: ERR_WORK_ORDER_VERSION_MISMATCH,
      httpStatus: 409,
      currentStatus: ctx.currentStatus,
      targetStatus: ctx.targetStatus,
      allowedTransitions: allowed,
    };
  }

  if (isTerminalWorkOrderStatus(ctx.currentStatus)) {
    return {
      ok: false,
      code: ERR_WORK_ORDER_INVALID_TRANSITION,
      httpStatus: 409,
      currentStatus: ctx.currentStatus,
      targetStatus: ctx.targetStatus,
      allowedTransitions: allowed,
    };
  }

  if (
    requiresCustomerApproval(
      ctx.currentStatus,
      ctx.targetStatus,
      ctx.customerAuthorized,
    )
  ) {
    return {
      ok: false,
      code: ERR_WORK_ORDER_APPROVAL_REQUIRED,
      httpStatus: 409,
      currentStatus: ctx.currentStatus,
      targetStatus: ctx.targetStatus,
      allowedTransitions: allowed,
    };
  }

  if (ctx.targetStatus === "CLOSED" && ctx.currentStatus !== "VERIFIED") {
    return {
      ok: false,
      code: ERR_WORK_ORDER_INVALID_TRANSITION,
      httpStatus: 409,
      currentStatus: ctx.currentStatus,
      targetStatus: ctx.targetStatus,
      allowedTransitions: allowed,
    };
  }

  const directEdge = allowed.includes(ctx.targetStatus);
  const skipViaInvalid =
    ctx.currentStatus === "QUOTED" &&
    (ctx.targetStatus === "IN_PROGRESS" || ctx.targetStatus === "CLOSED");

  if (!directEdge || skipViaInvalid) {
    return {
      ok: false,
      code: skipViaInvalid
        ? ERR_WORK_ORDER_APPROVAL_REQUIRED
        : ERR_WORK_ORDER_INVALID_TRANSITION,
      httpStatus: 409,
      currentStatus: ctx.currentStatus,
      targetStatus: ctx.targetStatus,
      allowedTransitions: allowed,
    };
  }

  const customerAuthorized =
    ctx.targetStatus === "APPROVED" ? true : ctx.customerAuthorized;

  return {
    ok: true,
    nextStatus: ctx.targetStatus,
    nextVersion: ctx.actualVersion + 1,
    customerAuthorized,
  };
}

export function walkHvacHappyPath(): WorkOrderStatus[] {
  const path: WorkOrderStatus[] = [
    "RECEIVED",
    "DIAGNOSED",
    "QUOTED",
    "APPROVED",
    "IN_PROGRESS",
    "VERIFIED",
    "CLOSED",
  ];
  let version = 1;
  let customerAuthorized = false;
  let status: WorkOrderStatus = "RECEIVED";

  for (const target of path.slice(1)) {
    const result = transitionWorkOrder({
      tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
      currentStatus: status,
      targetStatus: target,
      customerAuthorized,
      expectedVersion: version,
      actualVersion: version,
    });
    if (!result.ok) {
      throw new Error(
        `Happy path failed at ${status} -> ${target}: ${result.code}`,
      );
    }
    status = result.nextStatus;
    version = result.nextVersion;
    customerAuthorized = result.customerAuthorized;
  }

  return path;
}