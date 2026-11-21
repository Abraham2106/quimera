import type { Context } from "hono";

const LOOPBACK_ADDR = new Set(["127.0.0.1", "::1", "localhost"]);

function isLoopbackHost(host: string): boolean {
  const withoutPort = host.split(":")[0] ?? host;
  return LOOPBACK_ADDR.has(withoutPort.toLowerCase());
}

/** True when the request is considered loopback-only (binding or forwarded client). */
export function isLoopbackRequest(c: Context): boolean {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const client = forwarded.split(",")[0]?.trim() ?? "";
    return LOOPBACK_ADDR.has(client.toLowerCase());
  }

  const host = c.req.header("host");
  if (host && isLoopbackHost(host)) {
    return true;
  }

  // In-process Hono `app.request()` (vitest) has no Host; treat as loopback in test only.
  if (process.env.NODE_ENV === "test" && !forwarded && !host) {
    return true;
  }

  return false;
}