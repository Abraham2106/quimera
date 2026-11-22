import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createApp } from "./api/app.js";
import { otelExporterEndpoint } from "./api/logging/otel.js";
import {
  isReservedHttpPath,
  resolveStaticAssetDir,
  serveStaticAsset,
} from "./static-assets.js";

export type StartedOficiosServer = {
  readonly url: string;
  readonly port: number;
  close: () => Promise<void>;
};

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function startOficiosServer(options?: {
  port?: number;
  host?: string;
}): Promise<StartedOficiosServer> {
  const host = options?.host ?? process.env.OFICIOS_HOST ?? "127.0.0.1";
  const port = options?.port ?? Number(process.env.OFICIOS_PORT ?? 8787);
  const app = createApp();
  const staticDir = await resolveStaticAssetDir();
  let draining = false;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (draining) {
      res.statusCode = 503;
      res.end(JSON.stringify({ ok: false, draining: true }));
      return;
    }
    try {
      const hostHeader = req.headers.host ?? `${host}:${port}`;
      const url = new URL(req.url ?? "/", `http://${hostHeader}`);
      const method = req.method ?? "GET";
      if (
        staticDir &&
        !isReservedHttpPath(url.pathname) &&
        (method === "GET" || method === "HEAD")
      ) {
        const served = await serveStaticAsset(staticDir, url.pathname, method, res);
        if (served) {
          return;
        }
      }
      const body =
        method === "GET" || method === "HEAD" ? undefined : await readBody(req);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      const response = await app.fetch(
        new Request(url, { method, headers, body }),
      );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const payload = Buffer.from(await response.arrayBuffer());
      res.end(payload);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error: { code: "ERR_INTERNAL", message: err instanceof Error ? err.message : "error" },
        }),
      );
    }
  });

  process.once("SIGTERM", () => {
    draining = true;
    server.close(() => {
      process.exit(0);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  const bound = typeof address === "object" && address ? address.port : port;
  return {
    url: `http://${host}:${bound}`,
    port: bound,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

const isDirect =
  process.argv[1]?.endsWith("/server.ts") || process.argv[1]?.endsWith("/server.js");

if (isDirect) {
  const started = await startOficiosServer();
  process.stderr.write(
    `${JSON.stringify({ event: "oficios.listen", url: started.url, host: "127.0.0.1", otel: otelExporterEndpoint() !== null })}\n`,
  );
}
