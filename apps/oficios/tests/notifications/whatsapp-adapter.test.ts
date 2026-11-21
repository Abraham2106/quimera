import { describe, expect, it } from "vitest";

import {
  ERR_OFI_WHATSAPP_NOT_CONFIGURED,
  notifyWorkOrderEvent,
  whatsappNotificationsEnabled,
} from "../../src/notifications/whatsapp-adapter.js";
import * as whatsappAdapter from "../../src/notifications/whatsapp-adapter.js";

const syntheticEvent = {
  workOrderId: "00000000-0000-4000-8000-000000000001",
  status: "QUOTED" as const,
  recipientPhoneE164: "50600000000",
};

describe("T-OFI-006 — WhatsApp adapter aislado (QR-OFI-007)", () => {
  it("whatsappNotificationsEnabled es false con env vacío o sin flag exacto", () => {
    expect(whatsappNotificationsEnabled({})).toBe(false);
    expect(whatsappNotificationsEnabled({ QUIMERA_WHATSAPP_ENABLED: "false" })).toBe(
      false,
    );
    expect(whatsappNotificationsEnabled({ QUIMERA_WHATSAPP_ENABLED: "1" })).toBe(
      false,
    );
    expect(
      whatsappNotificationsEnabled({ QUIMERA_WHATSAPP_ENABLED: "true" }),
    ).toBe(true);
  });

  it("con env por defecto no entrega notificaciones", async () => {
    const result = await notifyWorkOrderEvent(syntheticEvent, {});
    expect(result).toEqual({ delivered: false, reason: "disabled" });
  });

  it("QUIMERA_WHATSAPP_ENABLED=true sin token retorna ERR_OFI_WHATSAPP_NOT_CONFIGURED", async () => {
    const result = await notifyWorkOrderEvent(syntheticEvent, {
      QUIMERA_WHATSAPP_ENABLED: "true",
    });
    expect(result).toMatchObject({
      delivered: false,
      code: ERR_OFI_WHATSAPP_NOT_CONFIGURED,
    });
    if ("code" in result) {
      expect(result.message).toMatch(/QUIMERA_WHATSAPP_TOKEN/);
    }
  });

  it("token presente no marca entrega (sin cliente de red)", async () => {
    const result = await notifyWorkOrderEvent(syntheticEvent, {
      QUIMERA_WHATSAPP_ENABLED: "true",
      QUIMERA_WHATSAPP_TOKEN: "synthetic-test-token",
    });
    expect(result).toEqual({ delivered: false, reason: "dry_run" });
  });

  it("el módulo no exporta funciones de aprobar o cerrar órdenes", () => {
    const exportNames = Object.keys(whatsappAdapter);
    const lifecycleExports = exportNames.filter((name) =>
      /approve|close/i.test(name),
    );
    expect(lifecycleExports).toEqual([]);
    expect(typeof notifyWorkOrderEvent).toBe("function");
    expect(notifyWorkOrderEvent.name).not.toMatch(/approve|close/i);
  });
});