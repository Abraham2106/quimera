import { isLoopbackRequest } from "./loopback.js";
import type { Context } from "hono";

export type OficiosAuthMode = "jwt" | "test-headers";

export function readOficiosAuthMode(): OficiosAuthMode {
  const raw = process.env.OFICIOS_AUTH_MODE?.trim().toLowerCase();
  if (raw === "test-headers") {
    return "test-headers";
  }
  return "jwt";
}

export function testHeadersAuthAllowed(c: Context): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (readOficiosAuthMode() !== "test-headers") {
    return false;
  }
  return isLoopbackRequest(c);
}