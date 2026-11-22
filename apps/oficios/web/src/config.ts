/** Cabeceras de desarrollo; mismos valores que `apps/oficios/tests/api/helpers.ts`. */
export const DEFAULT_TENANT_ID = "22222222-2222-7222-8222-222222222222";

export type DevApiConfig = {
  readonly apiBase: string;
  /** JWT Bearer para la API (producción y dev con auth real). */
  readonly accessToken: string;
  readonly tenantId: string;
  readonly testRole: "ADMIN" | "OPERATOR" | "AUDITOR_READONLY";
  readonly actorId: string;
  readonly workOrderId: string;
  readonly displayLabels: {
    readonly cliente: string;
    readonly equipo: string;
  };
};

function readSearchParam(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get(key)?.trim() ?? "";
}

export function loadDevApiConfig(): DevApiConfig {
  const fromEnv = import.meta.env as {
    readonly VITE_API_BASE?: string;
    readonly VITE_ACCESS_TOKEN?: string;
    readonly VITE_TENANT_ID?: string;
    readonly VITE_TEST_ROLE?: string;
    readonly VITE_ACTOR_ID?: string;
    readonly VITE_WORK_ORDER_ID?: string;
    readonly VITE_LABEL_CLIENTE?: string;
    readonly VITE_LABEL_EQUIPO?: string;
  };

  const mockAdmin =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mock");
  const roleRaw =
    readSearchParam("role") || (mockAdmin ? "ADMIN" : fromEnv.VITE_TEST_ROLE || "OPERATOR");
  const testRole =
    roleRaw === "ADMIN" || roleRaw === "AUDITOR_READONLY" ? roleRaw : "OPERATOR";

  return {
    apiBase: fromEnv.VITE_API_BASE ?? "",
    accessToken: fromEnv.VITE_ACCESS_TOKEN ?? "",
    tenantId: fromEnv.VITE_TENANT_ID ?? DEFAULT_TENANT_ID,
    testRole,
    actorId: fromEnv.VITE_ACTOR_ID ?? "web-dev-operator",
    workOrderId:
      readSearchParam("orden") ||
      fromEnv.VITE_WORK_ORDER_ID ||
      "",
    displayLabels: {
      cliente:
        fromEnv.VITE_LABEL_CLIENTE ??
        "Cliente de demostración — etiqueta sintética",
      equipo:
        fromEnv.VITE_LABEL_EQUIPO ??
        "Equipo HVAC minisplit (etiqueta sintética)",
    },
  };
}