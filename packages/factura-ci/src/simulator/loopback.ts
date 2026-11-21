import { ERR_SEC_LOOPBACK_ONLY } from "../constants.js";
import { FacturaCiError } from "../errors.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function assertLoopbackHost(host: string): void {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new FacturaCiError(
      ERR_SEC_LOOPBACK_ONLY,
      `${ERR_SEC_LOOPBACK_ONLY}: simulator bind refused for host "${host}" (loopback 127.0.0.1 / ::1 only).`,
    );
  }
}

export function parseTargetUrl(target: string): URL {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new FacturaCiError(
      ERR_SEC_LOOPBACK_ONLY,
      `Invalid simulator target URL: ${target}`,
    );
  }
  if (url.protocol !== "http:") {
    throw new FacturaCiError(
      ERR_SEC_LOOPBACK_ONLY,
      `Simulator target must use http loopback, got ${url.protocol}`,
    );
  }
  assertLoopbackHost(url.hostname);
  return url;
}