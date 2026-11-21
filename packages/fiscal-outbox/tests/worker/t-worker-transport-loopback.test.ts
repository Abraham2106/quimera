import http from "node:http";
import type { AddressInfo } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";

import { createFiscalCredentialVault } from "../../src/vault/create-fiscal-vault.js";
import { withFobTenantTransaction } from "../../src/db/connection.js";
import { upsertFiscalCredentials } from "../../src/store/pg-fiscal-credentials.js";
import {
  createFiscalWorkerTransport,
  resolveFiscalTransportKind,
} from "../../src/worker/create-fiscal-transport.js";
import { loadDecryptedFiscalCredentials } from "../../src/worker/fiscal-credentials.js";
import { runWorkerUntilStop } from "../../src/worker/lifecycle.js";
import { processOnce } from "../../src/worker/process-once.js";
import { runFiscalWorker } from "../../src/worker/run-fiscal-worker.js";
import { writeWorkerLog } from "../../src/worker/worker-log.js";
import { resetFobSchema, seedTenant, TENANT_A } from "../store/helpers.js";
import { ISSUER, persistWorkerDoc, buildWorkerDoc } from "./document-fixture.js";

const PLANTED_PIN = "PIN-PLANTED-776655";

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function startRecepcionStub(
  onGet?: () => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      void handle(req, res);
    });
    async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      if (req.method === "GET" && path.startsWith("/recepcion/")) {
        onGet?.();
        json(res, 200, {
          clave: decodeURIComponent(path.slice("/recepcion/".length)),
          "ind-estado": "aceptado",
          "respuesta-xml": Buffer.from("<MensajeHacienda/>", "utf8").toString("base64"),
        });
        return;
      }
      if (req.method === "POST" && path === "/recepcion") {
        json(res, 201, { "ind-estado": "recibido" });
        return;
      }
      json(res, 404, { error: "not found" });
    }
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise((done, reject) => {
            server.close((error) => (error ? reject(error) : done()));
          }),
      });
    });
  });
}

describe.sequential("worker — transporte loopback y arranque", () => {
  let client: Sql | undefined;
  const vault = createFiscalCredentialVault();
  const prevTransport = process.env.FISCAL_TRANSPORT;
  const prevUrl = process.env.FISCAL_TRANSPORT_URL;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    const notAfter = new Date("2027-06-01T00:00:00.000Z");
    await upsertFiscalCredentials(client, vault, {
      tenantId: TENANT_A,
      issuerId: ISSUER,
      environment: "sandbox",
      p12: Buffer.from([0x30, 0x82, 0x01, 0x00, 0x02]),
      pin: PLANTED_PIN,
      idpUsername: "worker-user",
      idpPassword: "worker-pass",
      certNotAfter: notAfter,
    });
    await withFobTenantTransaction(client, TENANT_A, async (tx) => {
      await tx`
        INSERT INTO fob_fiscal_issuer_config (tenant_id, issuer_id, active_environment)
        VALUES (${TENANT_A}::uuid, ${ISSUER}, 'sandbox')
        ON CONFLICT (tenant_id, issuer_id) DO UPDATE SET active_environment = 'sandbox'
      `;
    });
  });

  afterAll(async () => {
    if (prevTransport === undefined) delete process.env.FISCAL_TRANSPORT;
    else process.env.FISCAL_TRANSPORT = prevTransport;
    if (prevUrl === undefined) delete process.env.FISCAL_TRANSPORT_URL;
    else process.env.FISCAL_TRANSPORT_URL = prevUrl;
    await client?.end();
  });

  it("resuelve loopback por defecto en pruebas", () => {
    expect(resolveFiscalTransportKind()).toBe("loopback");
  });

  it("descifra credenciales sin registrar el PIN sembrado", async () => {
    if (!client) throw new Error("no client");
    const creds = await loadDecryptedFiscalCredentials(client, vault, TENANT_A, ISSUER);
    expect(creds.pin).toBe(PLANTED_PIN);
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
  try {
      writeWorkerLog({ event: "worker.test", pin: PLANTED_PIN, message: `pin=${PLANTED_PIN}` });
      const joined = chunks.join("");
      expect(joined).not.toContain(PLANTED_PIN);
      expect(joined).toMatch(/pin=\[redacted\]/i);
    } finally {
      spy.mockRestore();
    }
  });

  it("processOnce alcanza GET terminal contra stub HTTP loopback", async () => {
    if (!client) throw new Error("no client");
    const stub = await startRecepcionStub();
    process.env.FISCAL_TRANSPORT = "loopback";
    process.env.FISCAL_TRANSPORT_URL = stub.baseUrl;

    const doc = buildWorkerDoc(192);
    await persistWorkerDoc(client, doc);
    await withFobTenantTransaction(client, TENANT_A, async (tx) => {
      await tx`
        UPDATE fob_fiscal_documents
        SET delivery_state = 'ENVIADO', next_poll_at = now()
        WHERE clave = ${doc.clave}
      `;
    });

    const creds = await loadDecryptedFiscalCredentials(client, vault, TENANT_A, ISSUER);
    const { transport } = await createFiscalWorkerTransport({ credentials: creds });
    let sawGet = false;
    const wrapped = {
      ...transport,
      async getByClave(clave: string) {
        sawGet = true;
        return transport.getByClave(clave);
      },
    };

    const result = await processOnce(client, {
      workerId: "w-loopback",
      tenantId: TENANT_A,
      transport: wrapped,
      signXml: async (xml) => `${xml}<Signature/>`,
    });
    await stub.close();

    expect(result.processed).toBe(true);
    if (result.processed) expect(result.action).toBe("get");
    expect(sawGet).toBe(true);

    const row = await withFobTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ delivery_state: string }[]>`
        SELECT delivery_state FROM fob_fiscal_documents WHERE clave = ${doc.clave}
      `,
    );
    expect(row[0]?.delivery_state).toBe("ACEPTADO");
  });

  it("runFiscalWorker sale con código 0 cuando shouldStop se activa (SIGTERM)", async () => {
    if (!client) throw new Error("no client");
    const stub = await startRecepcionStub();
    process.env.FISCAL_TRANSPORT = "loopback";
    process.env.FISCAL_TRANSPORT_URL = stub.baseUrl;
    process.env.FISCAL_ISSUER_ID = ISSUER;

    let stop = false;
    const workerPromise = runFiscalWorker({
      client,
      tenantId: TENANT_A,
      vault,
      workerId: "w-sigterm",
      shouldStop: () => stop,
      idleBackoffMs: 5,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    stop = true;
    const code = await workerPromise;
    await stub.close();
    expect(code).toBe(0);
  });

  it("permanece en ciclo con backoff cuando la cola está vacía", async () => {
    let polls = 0;
    let stop = false;
    const sleep = vi.fn(async () => undefined);
    const code = await runWorkerUntilStop({
      shouldStop: () => stop || polls >= 2,
      idleBackoffMs: 10,
      sleep,
      processOnce: async () => {
        polls += 1;
        return { claimedId: null, idle: true };
      },
      releaseLease: async () => undefined,
    });
    expect(code).toBe(0);
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(sleep).toHaveBeenCalled();
  });
});