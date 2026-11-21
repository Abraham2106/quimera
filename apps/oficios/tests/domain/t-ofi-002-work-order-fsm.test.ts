import { describe, expect, it } from "vitest";

import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "../../src/domain/hvac-refrigeration-v1.js";
import {
  ERR_WORK_ORDER_APPROVAL_REQUIRED,
  ERR_WORK_ORDER_INVALID_TRANSITION,
} from "../../src/domain/work-order-errors.js";
import {
  getAllowedTransitions,
  transitionWorkOrder,
  walkHvacHappyPath,
} from "../../src/domain/work-order-fsm.js";

describe("T-OFI-002 — FSM hvac-refrigeration-v1", () => {
  it("recorre la ruta feliz RECEIVED → CLOSED", () => {
    expect(walkHvacHappyPath()).toEqual([
      "RECEIVED",
      "DIAGNOSED",
      "QUOTED",
      "APPROVED",
      "IN_PROGRESS",
      "VERIFIED",
      "CLOSED",
    ]);
  });

  it("expone transiciones permitidas por estado", () => {
    expect(getAllowedTransitions("QUOTED")).toEqual(["APPROVED", "CANCELLED"]);
    expect(getAllowedTransitions("VERIFIED")).toEqual(["CLOSED"]);
  });

  it("rechaza saltos inválidos con 409", () => {
    const result = transitionWorkOrder({
      tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
      currentStatus: "RECEIVED",
      targetStatus: "VERIFIED",
      customerAuthorized: false,
      expectedVersion: 1,
      actualVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(409);
      expect(result.code).toBe(ERR_WORK_ORDER_INVALID_TRANSITION);
    }
  });

  it("incrementa version en transiciones exitosas", () => {
    const result = transitionWorkOrder({
      tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
      currentStatus: "RECEIVED",
      targetStatus: "DIAGNOSED",
      customerAuthorized: false,
      expectedVersion: 3,
      actualVersion: 3,
    });
    expect(result).toEqual({
      ok: true,
      nextStatus: "DIAGNOSED",
      nextVersion: 4,
      customerAuthorized: false,
    });
  });
});

describe("AT-15 — bloqueo sin aprobación del cliente", () => {
  const base = {
    tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
    currentStatus: "QUOTED" as const,
    customerAuthorized: false,
    expectedVersion: 2,
    actualVersion: 2,
  };

  it.each(["IN_PROGRESS", "CLOSED"] as const)(
    "rechaza QUOTED → %s con ERR_WORK_ORDER_APPROVAL_REQUIRED",
    (targetStatus) => {
      const result = transitionWorkOrder({
        ...base,
        targetStatus,
      });
      expect(result).toMatchObject({
        ok: false,
        code: ERR_WORK_ORDER_APPROVAL_REQUIRED,
        httpStatus: 409,
        currentStatus: "QUOTED",
        targetStatus,
      });
    },
  );
});