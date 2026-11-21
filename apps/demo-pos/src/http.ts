import http from "node:http";
import https from "node:https";

export interface LoopbackHttpResponse {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
  readonly networkError?: boolean;
}

export function loopbackRequest(
  method: "GET" | "POST",
  url: string,
  body?: string,
  timeoutMs = 1_500,
): Promise<LoopbackHttpResponse> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("error", () => {
      resolve({ status: 0, headers: {}, body: "", networkError: true });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 0, headers: {}, body: "", networkError: true });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

export function assertNoRedirect(status: number): void {
  if (status >= 300 && status < 400) {
    throw new Error(`ERR_SEC_LOOPBACK_ONLY: redirect ${status} refused`);
  }
}