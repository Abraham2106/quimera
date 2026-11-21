import {
  buildClave,
  createStoredDocument,
  DocumentType,
  Situation,
  type StoredDocument,
} from "@dojocoding/hacienda-sdk";
import type { Sql } from "postgres";

import { PgDocumentStore } from "../../src/store/pg-document-store.js";
import { TENANT_A } from "../store/helpers.js";

const ISSUER = "3101222222";

export function buildWorkerDoc(sequence: number): StoredDocument {
  const clave = buildClave({
    date: new Date(2025, 10, 21),
    taxpayerId: ISSUER,
    documentType: DocumentType.FACTURA_ELECTRONICA,
    sequence,
    situation: Situation.NORMAL,
  });
  return createStoredDocument({
    xml: `<FacturaElectronica seq="${sequence}"/>`,
    clave,
    situation: "normal",
    generatedAt: new Date("2025-11-21T12:00:00.000Z"),
  });
}

export async function persistWorkerDoc(
  client: Sql,
  doc: StoredDocument,
): Promise<void> {
  const store = new PgDocumentStore(client, {
    tenantId: TENANT_A,
    issuerId: ISSUER,
    environment: "mock",
    docType: "01",
  });
  await store.persist(doc);
}

export { ISSUER, TENANT_A };