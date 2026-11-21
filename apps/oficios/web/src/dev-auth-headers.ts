import type { DevApiConfig } from "./config.js";

/** Cabeceras sintéticas en loopback cuando no hay JWT (OFICIOS_AUTH_MODE=test-headers). */
export function appendDevAuthHeaders(
  config: DevApiConfig,
  headers: Record<string, string>,
): void {
  if (config.accessToken.trim().length > 0) {
    return;
  }
  headers["x-tenant-id"] = config.tenantId;
  headers["x-test-role"] = config.testRole;
  headers["x-actor-id"] = config.actorId;
}