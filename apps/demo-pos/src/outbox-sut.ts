import { buildClave, parseClave } from "@dojocoding/hacienda-sdk";
import {
  allocateConsecutive,
  enqueueIntent,
  type FiscalEnvironment,
} from "@quimera/fiscal-outbox";
import type { Sql } from "postgres";

import type { FiscalEmitInput, FiscalEmitResult, FiscalSut } from "@quimera/factura-ci";

import { assertNoRedirect, loopbackRequest } from "./http.js";
import { createAsyncMutex } from "./mutex.js";
import { emisorForTenant, tenantUuidForSlug } from "./tenant-config.js";

const ENVIRONMENT: FiscalEnvironment = "mock";
const BRANCH = "001";
const TERMINAL = "00001";

interface StoredDoc {
  tenantId: string;
  operationId: string;
  clave: string;
  consecutivo: string;
  docType: "01" | "04";
  amountMinor: bigint;
  currency: "CRC" | "USD";
  state: string;
  postCompleted: boolean;
}

function mapHaciendaState(indEstado: string): string {
  switch (indEstado) {
    case "procesando":
      return "PROCESANDO";
    case "aceptado":
      return "ACEPTADO";
    case "rechazado":
      return "RECHAZADO";
    default:
      return "PENDIENTE";
  }
}

export function createOutboxSut(simulatorBaseUrl: string, client: Sql): FiscalSut {
  const byOperation = new Map<string, StoredDoc>();
  const byClave = new Map<string, StoredDoc>();
  const testHookSequences = new Map<string, number>();
  const mutex = createAsyncMutex();

  function sequenceKey(tenantId: string, docType: string): string {
    return `${tenantId}:${docType}`;
  }

  async function reserveConsecutive(tenantSlug: string, docType: "01" | "04"): Promise<number> {
    const tenantId = tenantUuidForSlug(tenantSlug);
    const issuerId = emisorForTenant(tenantSlug);
    return allocateConsecutive(client, {
      tenantId,
      issuerId,
      environment: ENVIRONMENT,
      branch: BRANCH,
      terminal: TERMINAL,
      docType,
    });
  }

  async function postOnce(doc: StoredDoc): Promise<string> {
    const emisor = emisorForTenant(doc.tenantId);
    const payload = JSON.stringify({
      clave: doc.clave,
      consecutivo: doc.consecutivo,
      tenantId: doc.tenantId,
      operationId: doc.operationId,
      docType: doc.docType,
      emisor: { numeroIdentificacion: emisor },
    });

    const res = await loopbackRequest(
      "POST",
      `${simulatorBaseUrl}/recepcion`,
      payload,
      400,
    );
    assertNoRedirect(res.status);

    if (res.networkError || res.status === 0) {
      doc.postCompleted = true;
      doc.state = "INCIERTO";
      return pollUntilTerminal(doc);
    }
    if (res.status === 503) {
      doc.state = "ERROR_TECNICO";
      return doc.state;
    }
    if (res.status === 202 || res.status === 201) {
      doc.postCompleted = true;
      doc.state = res.status === 202 ? "PENDIENTE" : "ENVIADO";
      return await pollUntilTerminal(doc);
    }
    if (res.status === 429) {
      doc.state = "PENDIENTE";
      return doc.state;
    }
    doc.state = "PENDIENTE";
    return doc.state;
  }

  async function pollUntilTerminal(doc: StoredDoc): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await loopbackRequest(
        "GET",
        `${simulatorBaseUrl}/recepcion/${encodeURIComponent(doc.clave)}`,
      );
      assertNoRedirect(res.status);
      if (res.networkError) {
        continue;
      }
      if (res.status === 503) {
        doc.state = "ERROR_TECNICO";
        return doc.state;
      }
      let ind = "aceptado";
      try {
        const body = JSON.parse(res.body) as { "ind-estado"?: string };
        ind = body["ind-estado"] ?? ind;
      } catch {
        /* ignore */
      }
      const mapped = mapHaciendaState(ind);
      doc.state = mapped;
      if (mapped === "ACEPTADO" || mapped === "RECHAZADO") {
        return mapped;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    return doc.state;
  }

  async function emit(input: FiscalEmitInput): Promise<FiscalEmitResult> {
    return mutex.run(async () => {
      const opKey = `${input.tenantId}:${input.operationId}`;
      const existing = byOperation.get(opKey);
      if (existing) {
        if (existing.state === "ACEPTADO") {
          if (
            existing.amountMinor === input.amountMinor &&
            existing.currency === input.currency
          ) {
            return {
              clave: existing.clave,
              consecutivo: existing.consecutivo,
              state: existing.state,
            };
          }
          throw Object.assign(new Error("ERR_FCI_MUTATION_FORBIDDEN"), {
            code: "ERR_FCI_MUTATION_FORBIDDEN",
          });
        }
        if (!existing.postCompleted) {
          if (existing.state === "INCIERTO") {
            existing.state = await pollUntilTerminal(existing);
          } else if (existing.state === "FIRMADO") {
            existing.state = await postOnce(existing);
          }
        } else if (
          existing.state === "PENDIENTE" ||
          existing.state === "PROCESANDO" ||
          existing.state === "ENVIADO"
        ) {
          existing.state = await pollUntilTerminal(existing);
        }
        return {
          clave: existing.clave,
          consecutivo: existing.consecutivo,
          state: existing.state,
        };
      }

      const issuerId = emisorForTenant(input.tenantId);
      const tenantUuid = tenantUuidForSlug(input.tenantId);
      await enqueueIntent(client, {
        tenantId: tenantUuid,
        issuerId,
        environment: ENVIRONMENT,
        operationId: input.operationId,
        docType: input.docType,
        payloadSnapshot: {
          tenantSlug: input.tenantId,
          amountMinor: input.amountMinor.toString(),
          currency: input.currency,
        },
      });

      const seq = await reserveConsecutive(input.tenantId, input.docType);
      const consecutivo = String(seq).padStart(10, "0");
      const emisor = emisorForTenant(input.tenantId);
      const clave = buildClave({
        date: new Date("2026-11-21T12:00:00-06:00"),
        taxpayerId: emisor,
        documentType: input.docType,
        sequence: seq,
        situation: "1",
        securityCode: String(10_000_000 + seq).slice(-8),
      });

      const doc: StoredDoc = {
        tenantId: input.tenantId,
        operationId: input.operationId,
        clave,
        consecutivo,
        docType: input.docType,
        amountMinor: input.amountMinor,
        currency: input.currency,
        state: "FIRMADO",
        postCompleted: false,
      };
      byOperation.set(opKey, doc);
      byClave.set(clave, doc);

      doc.state = await postOnce(doc);
      return {
        clave: doc.clave,
        consecutivo: doc.consecutivo,
        state: doc.state,
      };
    });
  }

  async function status(
    tenantId: string,
    clave: string,
  ): Promise<{ state: string }> {
    const doc = byClave.get(clave);
    if (!doc || doc.tenantId !== tenantId) {
      throw Object.assign(new Error("ERR_FCI_TENANT_FORBIDDEN"), {
        code: "ERR_FCI_TENANT_FORBIDDEN",
        status: 403,
      });
    }
    if (doc.state === "PENDIENTE" || doc.state === "PROCESANDO" || doc.state === "ENVIADO") {
      doc.state = await pollUntilTerminal(doc);
    }
    return { state: doc.state };
  }

  async function restart(): Promise<void> {
    for (const doc of byClave.values()) {
      if (
        doc.state === "FIRMADO" ||
        doc.state === "INCIERTO" ||
        doc.state === "PENDIENTE" ||
        doc.state === "PROCESANDO"
      ) {
        if (!doc.postCompleted) {
          doc.state = await postOnce(doc);
        } else {
          doc.state = await pollUntilTerminal(doc);
        }
      }
    }
  }

  return {
    emit,
    status,
    restart,
    _inspectClave(clave: string) {
      return byClave.get(clave);
    },
    _markPreEmit(operationId: string, tenantId: string, docType: "01" | "04") {
      const key = sequenceKey(tenantId, docType);
      const next = (testHookSequences.get(key) ?? 0) + 1;
      testHookSequences.set(key, next);
      const consecutivo = String(next).padStart(10, "0");
      const emisor = emisorForTenant(tenantId);
      const clave = buildClave({
        date: new Date("2026-11-21T12:00:00-06:00"),
        taxpayerId: emisor,
        documentType: docType,
        sequence: next,
        situation: "1",
        securityCode: String(10_000_000 + next).slice(-8),
      });
      const doc: StoredDoc = {
        tenantId,
        operationId,
        clave,
        consecutivo,
        docType,
        amountMinor: 1n,
        currency: "CRC",
        state: "FIRMADO",
        postCompleted: false,
      };
      byOperation.set(`${tenantId}:${operationId}`, doc);
      byClave.set(clave, doc);
    },
    _parseClave(clave: string) {
      return parseClave(clave);
    },
  } as FiscalSut & {
    _inspectClave: (clave: string) => StoredDoc | undefined;
    _markPreEmit: (op: string, tenant: string, dt: "01" | "04") => void;
    _parseClave: (clave: string) => ReturnType<typeof parseClave>;
  };
}