import { createServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { Hono } from "hono";
import type { Sql } from "postgres";

import type { FiscalEmitInput, FiscalSut } from "@quimera/factura-ci";

import { createDemoPosSut, type DemoPosMode } from "./sut-factory.js";

export type DemoPosServerHandle = {
  readonly baseUrl: string;
  readonly mode: DemoPosMode;
  readonly sut: FiscalSut;
  close(): Promise<void>;
};

function nodeListener(
  fetchFn: (request: Request) => Response | Promise<Response>,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const host = req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) {
            headers.append(key, v);
          }
        } else {
          headers.set(key, value);
        }
      }
    }

    const method = req.method ?? "GET";
    const hasBody = method !== "GET" && method !== "HEAD";

    const requestInit: RequestInit = { method, headers };
    if (hasBody) {
      requestInit.body = req;
      requestInit.duplex = "half";
    }

    const request = new Request(url, requestInit);

    Promise.resolve(fetchFn(request))
      .then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
      })
      .catch((err) => {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      });
  };
}

export function createDemoPosApp(
  mode: DemoPosMode,
  simulatorBaseUrl: string,
  db?: Sql,
): { app: Hono; sut: FiscalSut } {
  const sut = createDemoPosSut(mode, simulatorBaseUrl, db);
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ ok: true, app: "demo-pos", mode, simulator: simulatorBaseUrl }),
  );

  app.post("/v1/emit", async (c) => {
    const body = (await c.req.json()) as FiscalEmitInput;
    const amountMinor =
      typeof body.amountMinor === "string" ? BigInt(body.amountMinor) : body.amountMinor;
    const result = await sut.emit({ ...body, amountMinor });
    return c.json(result);
  });

  app.get("/v1/status/:tenantId/:clave", async (c) => {
    const tenantId = c.req.param("tenantId");
    const clave = c.req.param("clave");
    const result = await sut.status(tenantId, clave);
    return c.json(result);
  });

  app.post("/v1/restart", async (c) => {
    await sut.restart();
    return c.json({ restarted: true });
  });

  return { app, sut };
}

export async function startDemoPosServer(options: {
  mode: DemoPosMode;
  simulatorBaseUrl: string;
  host?: string;
  port?: number;
  db?: Sql;
}): Promise<DemoPosServerHandle> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("demo-pos binds loopback only (127.0.0.1)");
  }
  const { app, sut } = createDemoPosApp(options.mode, options.simulatorBaseUrl, options.db);

  const server: Server = await new Promise((resolve, reject) => {
    const s = createServer(nodeListener(app.fetch.bind(app)));
    s.once("error", reject);
    s.listen(options.port ?? 0, host, () => resolve(s));
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://${host}:${port}`;

  return {
    baseUrl,
    mode: options.mode,
    sut,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}