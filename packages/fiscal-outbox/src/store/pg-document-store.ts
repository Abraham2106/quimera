import { randomUUID } from "node:crypto";

import {
  isValidTransition,
  type DeliveryState,
  type DocumentStore,
  type StoredDocument,
} from "@dojocoding/hacienda-sdk";
import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../db/connection.js";
import {
  consecutivoFromClave,
  deliveryJsonEnvelope,
  rowToStoredDocument,
  snapshotFromStoredDocument,
  type FiscalDocumentRow,
} from "./row-map.js";

export type PgDocumentStoreScope = {
  readonly tenantId: string;
  readonly issuerId: string;
  readonly environment: "staging" | "production" | "mock";
  readonly docType?: string;
};

export class PgDocumentStore implements DocumentStore {
  constructor(
    private readonly client: Sql,
    private readonly scope: PgDocumentStoreScope,
  ) {}

  async persist(doc: StoredDocument): Promise<void> {
    const consecutivo = consecutivoFromClave(doc.clave);
    const snapshot = snapshotFromStoredDocument(doc);
    const envelope = deliveryJsonEnvelope(snapshot, doc.lastError);
    const docType = this.scope.docType ?? consecutivo.slice(8, 10);

    await withFobTenantTransaction(this.client, this.scope.tenantId, async (tx) => {
      const existing = await tx<FiscalDocumentRow[]>`
        SELECT id, tenant_id, intent_id, clave, consecutivo, delivery_state, attempts, last_error_json, updated_at
        FROM fob_fiscal_documents
        WHERE clave = ${doc.clave}
        FOR UPDATE
      `;

      if (existing[0]) {
        const loaded = rowToStoredDocument(existing[0]);
        if (
          loaded.xml !== doc.xml ||
          loaded.situation !== doc.situation ||
          loaded.generatedAt !== doc.generatedAt
        ) {
          throw new Error(
            "A clave already binds different immutable document bytes or metadata",
          );
        }
        return;
      }

      const intentId = randomUUID();
      await tx`
        INSERT INTO fob_fiscal_intents (
          id,
          tenant_id,
          issuer_id,
          environment,
          operation_id,
          purpose,
          doc_type,
          status,
          payload_snapshot
        )
        VALUES (
          ${intentId}::uuid,
          ${this.scope.tenantId}::uuid,
          ${this.scope.issuerId},
          ${this.scope.environment},
          ${`doc:${doc.clave}`},
          'primary',
          ${docType},
          'DOCUMENT_ASSIGNED',
          ${tx.json({ clave: doc.clave })}
        )
        ON CONFLICT (tenant_id, environment, operation_id, purpose) DO NOTHING
      `;

      const intent = await tx<{ id: string }[]>`
        SELECT id
        FROM fob_fiscal_intents
        WHERE tenant_id = ${this.scope.tenantId}::uuid
          AND environment = ${this.scope.environment}
          AND operation_id = ${`doc:${doc.clave}`}
          AND purpose = 'primary'
      `;
      const resolvedIntentId = intent[0]?.id;
      if (!resolvedIntentId) {
        throw new Error("Failed to resolve fiscal intent for document persist");
      }

      const docId = randomUUID();
      await tx`
        INSERT INTO fob_fiscal_documents (
          id,
          tenant_id,
          intent_id,
          clave,
          consecutivo,
          delivery_state,
          attempts,
          last_error_json
        )
        VALUES (
          ${docId}::uuid,
          ${this.scope.tenantId}::uuid,
          ${resolvedIntentId}::uuid,
          ${doc.clave},
          ${consecutivo},
          ${doc.state},
          ${doc.attempts},
          ${tx.json(envelope as never)}
        )
      `;
    });
  }

  async get(clave: string): Promise<StoredDocument | null> {
    const rows = await withFobTenantTransaction(this.client, this.scope.tenantId, async (tx) =>
      tx<FiscalDocumentRow[]>`
        SELECT id, tenant_id, intent_id, clave, consecutivo, delivery_state, attempts, last_error_json, updated_at
        FROM fob_fiscal_documents
        WHERE tenant_id = ${this.scope.tenantId}::uuid
          AND clave = ${clave}
      `,
    );
    const row = rows[0];
    return row ? rowToStoredDocument(row) : null;
  }

  async listPending(): Promise<StoredDocument[]> {
    const rows = await withFobTenantTransaction(this.client, this.scope.tenantId, async (tx) =>
      tx<FiscalDocumentRow[]>`
        SELECT id, tenant_id, intent_id, clave, consecutivo, delivery_state, attempts, last_error_json, updated_at
        FROM fob_fiscal_documents
        WHERE tenant_id = ${this.scope.tenantId}::uuid
          AND delivery_state NOT IN ('ACEPTADO', 'RECHAZADO', 'VENCIDO')
        ORDER BY updated_at ASC
      `,
    );
    return rows.map((row) => rowToStoredDocument(row));
  }

  async transition(
    clave: string,
    from: DeliveryState,
    to: DeliveryState,
    reason?: string,
  ): Promise<void> {
    if (!isValidTransition(from, to)) {
      throw new Error("Delivery transition conflict");
    }

    await withFobTenantTransaction(this.client, this.scope.tenantId, async (tx) => {
      const rows = await tx<FiscalDocumentRow[]>`
        SELECT id, tenant_id, intent_id, clave, consecutivo, delivery_state, attempts, last_error_json, updated_at
        FROM fob_fiscal_documents
        WHERE tenant_id = ${this.scope.tenantId}::uuid
          AND clave = ${clave}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row || row.delivery_state !== from) {
        throw new Error("Delivery transition conflict");
      }

      const doc = rowToStoredDocument(row);
      const at = new Date().toISOString();
      const transitions = [
        ...doc.transitions,
        {
          from,
          to,
          at,
          ...(reason !== undefined ? { reason } : {}),
        },
      ];
      const snapshot = snapshotFromStoredDocument({ ...doc, transitions });
      const envelope = deliveryJsonEnvelope(snapshot, doc.lastError);

      await tx`
        UPDATE fob_fiscal_documents
        SET
          delivery_state = ${to},
          last_error_json = ${tx.json(envelope as never)},
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
    });
  }

  async update(clave: string, patch: Partial<StoredDocument>): Promise<void> {
    if (Object.keys(patch).some((key) => key !== "attempts" && key !== "lastError")) {
      throw new Error("Only delivery attempts and diagnostics can be patched");
    }

    await withFobTenantTransaction(this.client, this.scope.tenantId, async (tx) => {
      const rows = await tx<FiscalDocumentRow[]>`
        SELECT id, tenant_id, intent_id, clave, consecutivo, delivery_state, attempts, last_error_json, updated_at
        FROM fob_fiscal_documents
        WHERE tenant_id = ${this.scope.tenantId}::uuid
          AND clave = ${clave}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        throw new Error("Document not found");
      }

      const doc = rowToStoredDocument(row);
      const next: StoredDocument = {
        ...doc,
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
      };
      const snapshot = snapshotFromStoredDocument(next);
      const envelope = deliveryJsonEnvelope(snapshot, next.lastError);

      await tx`
        UPDATE fob_fiscal_documents
        SET
          attempts = ${next.attempts},
          last_error_json = ${tx.json(envelope as never)},
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
    });
  }

  async getState(clave: string): Promise<DeliveryState | null> {
    const rows = await withFobTenantTransaction(this.client, this.scope.tenantId, async (tx) =>
      tx<{ delivery_state: DeliveryState }[]>`
        SELECT delivery_state
        FROM fob_fiscal_documents
        WHERE tenant_id = ${this.scope.tenantId}::uuid
          AND clave = ${clave}
      `,
    );
    return rows[0]?.delivery_state ?? null;
  }
}