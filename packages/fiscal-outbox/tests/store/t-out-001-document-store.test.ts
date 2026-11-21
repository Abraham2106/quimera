import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import {
  VALID_TRANSITIONS,
  buildClave,
  createStoredDocument,
  isValidTransition,
  DocumentType,
  Situation,
  type DeliveryState,
  type StoredDocument,
} from "@dojocoding/hacienda-sdk";

import { PgDocumentStore } from "../../src/store/pg-document-store.js";
import { resetFobSchema, seedTenant, TENANT_A } from "./helpers.js";

const SAMPLE_CLAVE = buildClave({
  date: new Date(2025, 11, 12),
  taxpayerId: "3101111111",
  documentType: DocumentType.FACTURA_ELECTRONICA,
  sequence: 1,
  situation: Situation.NORMAL,
});

function buildDoc(overrides?: Partial<StoredDocument>): StoredDocument {
  const base = createStoredDocument({
    xml: "<FacturaElectronica/>",
    clave: SAMPLE_CLAVE,
    situation: "normal",
    generatedAt: new Date("2025-12-12T12:00:00.000Z"),
  });
  return { ...base, ...overrides };
}

describe.sequential("T-OUT-001 — PgDocumentStore vs DocumentStore SDK", () => {
  let client: Sql | undefined;
  let store: PgDocumentStore;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    store = new PgDocumentStore(client, {
      tenantId: TENANT_A,
      issuerId: "3101111111",
      environment: "mock",
      docType: "01",
    });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("persist / get / getState", async () => {
  if (!client) throw new Error("no client");
    const doc = buildDoc();
    await store.persist(doc);
    const loaded = await store.get(SAMPLE_CLAVE);
    expect(loaded).toMatchObject({
      clave: SAMPLE_CLAVE,
      state: "FIRMADO",
      xml: doc.xml,
    });
    expect(await store.getState(SAMPLE_CLAVE)).toBe("FIRMADO");
  });

  it("VALID_TRANSITIONS: aplica transiciones válidas y rechaza inválidas", async () => {
    if (!client) throw new Error("no client");
    const clave = buildClave({
      date: new Date(2025, 11, 12),
      taxpayerId: "3101111111",
      documentType: DocumentType.FACTURA_ELECTRONICA,
      sequence: 2,
      situation: Situation.NORMAL,
    });
    await store.persist(
      buildDoc({
        clave,
        xml: "<FacturaElectronica version='2'/>",
      }),
    );

    const path: DeliveryState[] = ["FIRMADO", "PENDIENTE", "ENVIADO", "ACEPTADO"];
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i]!;
      const to = path[i + 1]!;
      expect(isValidTransition(from, to)).toBe(true);
      expect(VALID_TRANSITIONS[from]).toContain(to);
      await store.transition(clave, from, to, `step-${i}`);
    }
    expect(await store.getState(clave)).toBe("ACEPTADO");

    await expect(store.transition(clave, "ACEPTADO", "PENDIENTE")).rejects.toThrow(
      /transition conflict/i,
    );
  });

  it("listPending excluye terminales", async () => {
    if (!client) throw new Error("no client");
    const pending = await store.listPending();
    const claves = new Set(pending.map((d) => d.clave));
    expect(claves.has(SAMPLE_CLAVE)).toBe(true);
    expect(
      claves.has(
        buildClave({
          date: new Date(2025, 11, 12),
          taxpayerId: "3101111111",
          documentType: DocumentType.FACTURA_ELECTRONICA,
          sequence: 2,
          situation: Situation.NORMAL,
        }),
      ),
    ).toBe(false);
  });

  it("update solo attempts y lastError", async () => {
    if (!client) throw new Error("no client");
    await store.update(SAMPLE_CLAVE, { attempts: 2, lastError: "timeout" });
    const loaded = await store.get(SAMPLE_CLAVE);
    expect(loaded?.attempts).toBe(2);
    expect(loaded?.lastError).toBe("timeout");
    await expect(store.update(SAMPLE_CLAVE, { xml: "nope" } as Partial<StoredDocument>)).rejects.toThrow(
      /Only delivery attempts/,
    );
  });
});