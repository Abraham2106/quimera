import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { assertLoopbackHost } from "./loopback.js";
import type {
  ParsedSubmissionBody,
  SimulatorHandle,
  SimulatorOptions,
  SimulatorRequestLogEntry,
  SimulatorResponseMode,
} from "./types.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseSubmissionBody(raw: string): ParsedSubmissionBody {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* non-json body */
  }

  const clave =
    typeof parsed.clave === "string"
      ? parsed.clave
      : typeof parsed.Clave === "string"
        ? parsed.Clave
        : null;

  const consecutivo =
    typeof parsed.consecutivo === "string"
      ? parsed.consecutivo
      : typeof parsed.numeroConsecutivo === "string"
        ? parsed.numeroConsecutivo
        : null;

  let emisor: string | null = null;
  const emisorField = parsed.emisor;
  if (emisorField && typeof emisorField === "object") {
    const e = emisorField as Record<string, unknown>;
    if (typeof e.numeroIdentificacion === "string") {
      emisor = e.numeroIdentificacion;
    }
  }
  if (!emisor && typeof parsed.emisorId === "string") {
    emisor = parsed.emisorId;
  }

  return {
    clave,
    consecutivo,
    emisor,
    tenantId: typeof parsed.tenantId === "string" ? parsed.tenantId : null,
    operationId:
      typeof parsed.operationId === "string" ? parsed.operationId : null,
    docType: typeof parsed.docType === "string" ? parsed.docType : null,
    raw,
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

interface ProcessingTracker {
  postCount: number;
  getCount: number;
}

export async function startSimulator(
  options: SimulatorOptions = {},
): Promise<SimulatorHandle> {
  const host = options.host ?? "127.0.0.1";
  assertLoopbackHost(host);

  const seed = options.seed ?? 20_261_121;
  let mode: SimulatorResponseMode = options.mode ?? "accepted";
  const log: SimulatorRequestLogEntry[] = [];
  const processingByClave = new Map<string, ProcessingTracker>();
  const registeredClaves = new Set<string>();

  function resetState(): void {
    processingByClave.clear();
    registeredClaves.clear();
  }

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

  if (method === "POST" && path === "/recepcion") {
      const body = await readBody(req);
      const parsed = parseSubmissionBody(body);

      log.push({
        method: "POST",
        path,
        clave: parsed.clave,
        consecutivo: parsed.consecutivo,
        emisor: parsed.emisor,
        body,
        at: new Date().toISOString(),
      });

      if (!parsed.clave) {
        json(res, 400, { error: "missing clave" });
        return;
      }

      if (mode === "conflict_409" && registeredClaves.has(parsed.clave)) {
        json(res, 409, {
          "ind-estado": "recibido",
          mensaje: "clave duplicada",
        });
        return;
      }

      registeredClaves.add(parsed.clave);
      const tracker = processingByClave.get(parsed.clave) ?? {
        postCount: 0,
        getCount: 0,
      };
      tracker.postCount += 1;
      processingByClave.set(parsed.clave, tracker);

      if (mode === "tcp_cut_post") {
        req.socket.destroy();
        return;
      }

      switch (mode) {
        case "rejected":
          json(res, 201, {
            "ind-estado": "recibido",
            location: `/recepcion/${parsed.clave}`,
          });
          return;
        case "processing":
          json(res, 202, {
            "ind-estado": "recibido",
            location: `/recepcion/${parsed.clave}`,
          });
          return;
        case "rate_limit_429":
          res.writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": "2",
          });
          res.end(JSON.stringify({ mensaje: "rate limit" }));
          return;
        case "unavailable_503":
          json(res, 503, { mensaje: "Service Unavailable" });
          return;
        case "accepted":
        default:
          json(res, 201, {
            "ind-estado": "recibido",
            location: `/recepcion/${parsed.clave}`,
          });
          return;
      }
    }

    if (method === "GET" && path.startsWith("/recepcion/")) {
      const clave = decodeURIComponent(path.slice("/recepcion/".length));
      log.push({
        method: "GET",
        path,
        clave,
        consecutivo: null,
        emisor: null,
        body: "",
        at: new Date().toISOString(),
      });

      const tracker = processingByClave.get(clave) ?? {
        postCount: 0,
        getCount: 0,
      };
      tracker.getCount += 1;
      processingByClave.set(clave, tracker);

      if (mode === "unavailable_503") {
        json(res, 503, { mensaje: "Service Unavailable" });
        return;
      }

      if (mode === "rejected") {
        json(res, 200, {
          "ind-estado": "rechazado",
          clave,
          "respuesta-xml": Buffer.from(
            "<MensajeHacienda><DetalleMensaje>Rechazo sintético</DetalleMensaje></MensajeHacienda>",
          ).toString("base64"),
        });
        return;
      }

      if (mode === "processing") {
        if (tracker.getCount <= 2) {
          json(res, 200, { "ind-estado": "procesando", clave });
          return;
        }
        json(res, 200, { "ind-estado": "aceptado", clave });
        return;
      }

      if (mode === "rate_limit_429" && tracker.getCount === 1) {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "2",
        });
        res.end(JSON.stringify({ mensaje: "rate limit" }));
        return;
      }

      json(res, 200, { "ind-estado": "aceptado", clave });
      return;
    }

    if (method === "POST" && path === "/redirect-test") {
      res.writeHead(302, { Location: "http://169.254.169.254/" });
      res.end();
      return;
    }

    json(res, 404, { error: "not found" });
  }

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(options.port ?? 0, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind simulator"));
        return;
      }
      const baseUrl = `http://${host}:${addr.port}`;
      resolve({
        baseUrl,
        host,
        port: addr.port,
        seed,
        setMode(next: SimulatorResponseMode) {
          mode = next;
          resetState();
        },
        getMode() {
          return mode;
        },
        getLog() {
          return log;
        },
        clearLog() {
          log.length = 0;
          resetState();
        },
        close() {
          return new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          });
        },
      });
    });
  });
}