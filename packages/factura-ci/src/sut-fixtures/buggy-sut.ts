import { buildClave } from "@dojocoding/hacienda-sdk";

import type {
  FiscalEmitInput,
  FiscalEmitResult,
  FiscalSut,
  FiscalStatusResult,
} from "../types/fiscal-sut.js";
import { assertNoRedirect, loopbackRequest } from "./http.js";
import { emisorForTenant } from "./tenant-config.js";

interface StoredDoc {
  tenantId: string;
  operationId: string;
  clave: string;
  consecutivo: string;
  docType: "01" | "04";
  state: string;
  retriedAfterCut: boolean;
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

export function createBuggySut(simulatorBaseUrl: string): FiscalSut {
  const sequences = new Map<string, number>();
  const byOperation = new Map<string, StoredDoc>();
  const byClave = new Map<string, StoredDoc>();
  const retriedOperations = new Set<string>();

  function sequenceKey(tenantId: string, docType: string): string {
    return `${tenantId}:${docType}`;
  }

  /** Race-prone consecutivo reservation (no lock). */
  async function nextSequenceUnsafe(
    tenantId: string,
    docType: "01" | "04",
  ): Promise<number> {
    const key = sequenceKey(tenantId, docType);
    const current = sequences.get(key) ?? 0;
    await new Promise((r) => setImmediate(r));
    const next = current + 1;
    sequences.set(key, next);
    return next;
  }

  async function buildDoc(
    input: FiscalEmitInput,
    seq: number,
  ): Promise<StoredDoc> {
    const consecutivo = String(seq).padStart(10, "0");
    const emisor = emisorForTenant(input.tenantId);
    const clave = buildClave({
      date: new Date("2026-11-21T12:00:00-06:00"),
      taxpayerId: emisor,
      documentType: input.docType,
      sequence: seq,
      situation: "1",
      securityCode: String(20_000_000 + seq).slice(-8),
    });
    return {
      tenantId: input.tenantId,
      operationId: input.operationId,
      clave,
      consecutivo,
      docType: input.docType,
      state: "FIRMADO",
      retriedAfterCut: false,
    };
  }

  async function postDoc(doc: StoredDoc): Promise<string> {
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
      doc.state = "INCIERTO";
      const opKey = `${doc.tenantId}:${doc.operationId}`;
      if (retriedOperations.has(opKey)) {
        return doc.state;
      }
      retriedOperations.add(opKey);
      const retrySeq = await nextSequenceUnsafe(doc.tenantId, doc.docType);
      const retryDoc = await buildDoc(
        {
          tenantId: doc.tenantId,
          operationId: doc.operationId,
          docType: doc.docType,
          amountMinor: 0n,
          currency: "CRC",
        },
        retrySeq,
      );
      byClave.set(retryDoc.clave, retryDoc);
      byOperation.set(opKey, retryDoc);
      return postDoc(retryDoc);
    }

    if (res.status === 503) {
      doc.state = "ERROR_TECNICO";
      return doc.state;
    }
    if (res.status === 202) {
      doc.state = "PENDIENTE";
      return await poll(doc);
    }
    if (res.status === 201) {
      doc.state = "ENVIADO";
      return await poll(doc);
    }
    if (res.status === 429) {
      doc.state = "PENDIENTE";
      return doc.state;
    }
    doc.state = "PENDIENTE";
    return doc.state;
  }

  async function poll(doc: StoredDoc): Promise<string> {
    const res = await loopbackRequest(
      "GET",
      `${simulatorBaseUrl}/recepcion/${encodeURIComponent(doc.clave)}`,
    );
    assertNoRedirect(res.status);
    let ind = "aceptado";
    try {
      const body = JSON.parse(res.body) as { "ind-estado"?: string };
      ind = body["ind-estado"] ?? ind;
    } catch {
      /* ignore */
    }
    const mapped = mapHaciendaState(ind);
    doc.state = mapped;
    return mapped;
  }

  async function emit(input: FiscalEmitInput): Promise<FiscalEmitResult> {
    const opKey = `${input.tenantId}:${input.operationId}`;
    const prior = byOperation.get(opKey);
    if (prior) {
      return {
        clave: prior.clave,
        consecutivo: prior.consecutivo,
        state: prior.state,
      };
    }

    const seq = await nextSequenceUnsafe(input.tenantId, input.docType);
    const doc = await buildDoc(input, seq);
    byOperation.set(opKey, doc);
    byClave.set(doc.clave, doc);
    doc.state = await postDoc(doc);
    return {
      clave: doc.clave,
      consecutivo: doc.consecutivo,
      state: doc.state,
    };
  }

  async function status(
    tenantId: string,
    clave: string,
  ): Promise<FiscalStatusResult> {
    const doc = byClave.get(clave);
    if (!doc) {
      return { state: "DESCONOCIDO" };
    }
    if (doc.tenantId !== tenantId) {
      return { state: doc.state };
    }
    return { state: doc.state };
  }

  async function restart(): Promise<void> {
    byOperation.clear();
    byClave.clear();
    sequences.clear();
  }

  return { emit, status, restart };
}