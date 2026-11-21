import type { WorkOrderStatus } from "../domain/work-order-status.js";

export const ERR_OFI_WHATSAPP_NOT_CONFIGURED =
  "ERR_OFI_WHATSAPP_NOT_CONFIGURED" as const;

export type WorkOrderWhatsappEvent = {
  readonly workOrderId: string;
  readonly status: WorkOrderStatus;
  readonly recipientPhoneE164: string;
};

export type NotifyWorkOrderEventDisabled = {
  readonly delivered: false;
  readonly reason: "disabled";
};

export type NotifyWorkOrderEventNotConfigured = {
  readonly delivered: false;
  readonly code: typeof ERR_OFI_WHATSAPP_NOT_CONFIGURED;
  readonly message: string;
};

/** Configured but no outbound client in this build (QR-OFI-007 isolation). */
export type NotifyWorkOrderEventDryRun = {
  readonly delivered: false;
  readonly reason: "dry_run";
};

export type NotifyWorkOrderEventResult =
  | NotifyWorkOrderEventDisabled
  | NotifyWorkOrderEventNotConfigured
  | NotifyWorkOrderEventDryRun;

export type QuimeraWhatsappEnv = Record<string, string | undefined>;

export function whatsappNotificationsEnabled(
  env: QuimeraWhatsappEnv = process.env,
): boolean {
  return env.QUIMERA_WHATSAPP_ENABLED === "true";
}

export async function notifyWorkOrderEvent(
  event: WorkOrderWhatsappEvent,
  env: QuimeraWhatsappEnv = process.env,
): Promise<NotifyWorkOrderEventResult> {
  void event;

  if (!whatsappNotificationsEnabled(env)) {
    return { delivered: false, reason: "disabled" };
  }

  const token = env.QUIMERA_WHATSAPP_TOKEN?.trim();
  if (!token) {
    return {
      delivered: false,
      code: ERR_OFI_WHATSAPP_NOT_CONFIGURED,
      message:
        "Las notificaciones WhatsApp están habilitadas pero falta QUIMERA_WHATSAPP_TOKEN.",
    };
  }

  return { delivered: false, reason: "dry_run" };
}