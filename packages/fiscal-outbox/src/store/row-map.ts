import type { DeliveryState, StoredDocument } from "@dojocoding/hacienda-sdk";
import { parseClave } from "@dojocoding/hacienda-sdk";

import {
  DELIVERY_SNAPSHOT_JSON_KEY,
  type DeliverySnapshotPayload,
} from "./types.js";

export type FiscalDocumentRow = {
  id: string;
  tenant_id: string;
  intent_id: string;
  clave: string;
  consecutivo: string;
  delivery_state: DeliveryState;
  attempts: number;
  last_error_json: Record<string, unknown> | null;
  updated_at: string;
};

export function consecutivoFromClave(clave: string): string {
  const parsed = parseClave(clave);
  return `${parsed.branch}${parsed.pos}${parsed.documentType}${parsed.sequenceRaw}`;
}

export function snapshotFromStoredDocument(doc: StoredDocument): DeliverySnapshotPayload {
  return {
    xml: doc.xml,
    situation: doc.situation,
    generatedAt: doc.generatedAt,
    deadlineBusinessDays: doc.deadlineBusinessDays,
    transitions: doc.transitions,
    obligation: doc.obligation,
    ...(doc.provisionalReference !== undefined
      ? { provisionalReference: doc.provisionalReference }
      : {}),
  };
}

export function rowToStoredDocument(row: FiscalDocumentRow): StoredDocument {
  const raw = row.last_error_json?.[DELIVERY_SNAPSHOT_JSON_KEY];
  if (!raw || typeof raw !== "object") {
    throw new Error(`Missing delivery snapshot for clave ${row.clave}`);
  }
  const snap = raw as DeliverySnapshotPayload;
  const lastError =
    typeof row.last_error_json?.lastError === "string"
      ? row.last_error_json.lastError
      : undefined;

  return {
    xml: snap.xml,
    clave: row.clave,
    situation: snap.situation as StoredDocument["situation"],
    generatedAt: snap.generatedAt,
    deadlineBusinessDays: snap.deadlineBusinessDays,
    state: row.delivery_state,
    transitions: snap.transitions as StoredDocument["transitions"],
    obligation: snap.obligation as StoredDocument["obligation"],
    attempts: row.attempts,
    ...(snap.provisionalReference !== undefined
      ? { provisionalReference: snap.provisionalReference }
      : {}),
    ...(lastError !== undefined ? { lastError } : {}),
  };
}

export function deliveryJsonEnvelope(
  snapshot: DeliverySnapshotPayload,
  lastError?: string,
): Record<string, unknown> {
  return {
    [DELIVERY_SNAPSHOT_JSON_KEY]: snapshot,
    ...(lastError !== undefined ? { lastError } : {}),
  };
}