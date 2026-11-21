export const WORK_ORDER_STATUSES = [
  "RECEIVED",
  "DIAGNOSED",
  "QUOTED",
  "APPROVED",
  "IN_PROGRESS",
  "VERIFIED",
  "CLOSED",
  "CANCELLED",
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

const TERMINAL: ReadonlySet<WorkOrderStatus> = new Set(["CLOSED", "CANCELLED"]);

export function isTerminalWorkOrderStatus(status: WorkOrderStatus): boolean {
  return TERMINAL.has(status);
}