import { randomUUID } from "node:crypto";

import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ERR_WORK_ORDER_APPROVAL_REQUIRED,
  ERR_WORK_ORDER_INVALID_TRANSITION,
  ERR_WORK_ORDER_VERSION_MISMATCH,
  type WorkOrderFsmErrorCode,
} from "../domain/work-order-errors.js";
import type { WorkOrderStatus } from "../domain/work-order-status.js";
import { getAllowedTransitions } from "../domain/work-order-fsm.js";

export const ERR_FORBIDDEN = "ERR_FORBIDDEN" as const;
export const ERR_NOT_FOUND = "ERR_NOT_FOUND" as const;
export const ERR_VALIDATION = "ERR_VALIDATION" as const;
export const ERR_TENANT_MISMATCH = "ERR_TENANT_MISMATCH" as const;

export type ApiErrorBody = {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly category: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly correlationId: string;
    readonly details?: Record<string, unknown>;
  };
  readonly warnings: readonly [];
};

export function conflictResponse(
  code: WorkOrderFsmErrorCode,
  message: string,
  details: Record<string, unknown>,
): { status: 409; body: ApiErrorBody } {
  return {
    status: 409,
    body: {
      ok: false,
      error: {
        code,
        category: "CONFLICT",
        message,
        retryable: false,
        correlationId: randomUUID(),
        details,
      },
      warnings: [],
    },
  };
}

export function fsmFailureToResponse(failure: {
  code: WorkOrderFsmErrorCode;
  currentStatus: WorkOrderStatus;
  targetStatus: WorkOrderStatus;
  allowedTransitions: readonly WorkOrderStatus[];
}): { status: 409; body: ApiErrorBody } {
  const messages: Record<WorkOrderFsmErrorCode, string> = {
    [ERR_WORK_ORDER_APPROVAL_REQUIRED]:
      "No se puede avanzar la orden: falta la aprobación explícita del cliente.",
    [ERR_WORK_ORDER_INVALID_TRANSITION]:
      "La transición solicitada no está permitida para el estado actual.",
    [ERR_WORK_ORDER_VERSION_MISMATCH]:
      "La orden cambió desde la última lectura; recargue e intente de nuevo.",
  };

  return conflictResponse(failure.code, messages[failure.code], {
    currentStatus: failure.currentStatus,
    requestedStatus: failure.targetStatus,
    allowedTransitions:
      failure.code === ERR_WORK_ORDER_APPROVAL_REQUIRED
        ? [...getAllowedTransitions(failure.currentStatus)]
        : [...failure.allowedTransitions],
    missingRequirements:
      failure.code === ERR_WORK_ORDER_APPROVAL_REQUIRED
        ? ["customer_approval"]
        : undefined,
  });
}

export function errorResponse(
  status: ContentfulStatusCode,
  code: string,
  category: string,
  message: string,
  details?: Record<string, unknown>,
): { status: ContentfulStatusCode; body: ApiErrorBody } {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        category,
        message,
        retryable: false,
        correlationId: randomUUID(),
        details,
      },
      warnings: [],
    },
  };
}