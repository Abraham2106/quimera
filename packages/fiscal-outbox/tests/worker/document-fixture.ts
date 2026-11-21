import { createHash, randomUUID } from "node:crypto";
import {
  buildClave,
  createStoredDocument,
  DocumentType,
  Situation,
  type StoredDocument,
} from "@dojocoding/hacienda-sdk";
import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../../src/db/connection.js";
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

async function attachSignedXmlArtifact(
  client: Sql,
  tenantId: string,
  clave: string,
  xml: string,
): Promise<void> {
  const artifactId = randomUUID();
  const sha256 = createHash("sha256").update(xml).digest("hex");
  await withFobTenantTransaction(client, tenantId, async (tx) => {
    await tx`
      INSERT INTO qum_artifacts (
        id,
        tenant_id,
        sha256,
        artifact_kind,
        original_name,
        mime_type,
        byte_size,
        storage_uri
      )
      VALUES (
        ${artifactId}::uuid,
        ${tenantId}::uuid,
        ${sha256},
        'fe_xml_signed',
        ${`signed-${clave}.xml`},
        'application/xml',
        ${Buffer.byteLength(xml, "utf8")},
        ${`cas://fiscal-outbox/${clave}.xml`}
      )
    `;
    await tx`
      UPDATE fob_fiscal_documents
      SET signed_xml_artifact_id = ${artifactId}::uuid
      WHERE tenant_id = ${tenantId}::uuid AND clave = ${clave}
    `;
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
  await attachSignedXmlArtifact(client, TENANT_A, doc.clave, doc.xml);
}

export { ISSUER, TENANT_A };