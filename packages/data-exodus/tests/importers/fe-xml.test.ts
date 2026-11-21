/**
 * Fixture FE 4.4: built with `buildFacturaXml` + `parseDocumentXml` round-trip from
 * `@dojocoding/hacienda-sdk` (order.json shape). Synthetic IDs only — no real cédulas.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Sql } from "postgres";
import {
  buildClave,
  buildFacturaXml,
  calculateLineItemTotals,
  calculateInvoiceSummary,
  DocumentType,
  parseDocumentXml,
  Situation,
  validateFacturaInput,
} from "@dojocoding/hacienda-sdk";

import { qumDataSources, qumRawRecords, withTenantTransaction } from "../../src/db/index.js";
import {
  assertFeXmlSafeForParsing,
  FeXmlSourceImporter,
} from "../../src/importers/fe-xml.js";
import { FsArtifactStore } from "../../src/storage/fs-artifact-store.js";
import { resetAndMigrate, seedTenants, TENANT_A } from "../db/helpers.js";

const SCHEMA_V1 = "33333333-3333-7333-8333-333333333333";

const SYNTHETIC_ORDER = {
  proveedorSistemas: "3999999999",
  codigoActividadEmisor: "620100",
  emisor: {
    nombre: "Emisor Sintético S.A.",
    identificacion: {
      tipo: "02",
      numero: "3999999999",
    },
    correoElectronico: "emisor@synthetic.example",
    ubicacion: {
      provincia: "1",
      canton: "01",
      distrito: "01",
      otrasSenas: "Dirección sintética de prueba",
    },
  },
  receptor: {
    nombre: "Receptor Sintético S.R.L.",
    identificacion: {
      tipo: "02",
      numero: "3888888888",
    },
    correoElectronico: "receptor@synthetic.example",
  },
  condicionVenta: "01",
  medioPago: "01",
  lineItems: [
    {
      codigoCabys: "8310100000000",
      cantidad: 1,
      unidadMedida: "Sp",
      detalle: "Servicio sintético de prueba",
      precioUnitario: 10000,
      esServicio: true,
      impuesto: [
        {
          codigo: "01",
          codigoTarifaIVA: "08",
          tarifa: 13,
        },
      ],
    },
  ],
} as const;

export function buildMinimalFe44Xml(): {
  xml: string;
  clave: string;
  totalComprobante: number;
} {
  const date = new Date("2026-03-01T12:00:00.000Z");
  const branch = "001";
  const pos = "00001";
  const documentType = DocumentType.FACTURA_ELECTRONICA;
  const issuer = SYNTHETIC_ORDER.emisor.identificacion;
  const sequence = 7;
  const items = SYNTHETIC_ORDER.lineItems.map((item, index) =>
    calculateLineItemTotals({ ...item, numeroLinea: index + 1 }),
  );
  const summary = calculateInvoiceSummary(items);
  const { lineItems, medioPago, ...data } = SYNTHETIC_ORDER;
  void lineItems;
  const invoice = {
    ...data,
    clave: buildClave({
      date,
      taxpayerId: issuer.numero,
      branch,
      pos,
      documentType,
      sequence,
      situation: Situation.NORMAL,
    }),
    numeroConsecutivo: `${branch}${pos}${documentType}${String(sequence).padStart(10, "0")}`,
    fechaEmision: date.toISOString(),
    detalleServicio: items,
    resumenFactura: {
      ...summary,
      medioPago: [
        {
          tipoMedioPago: medioPago,
          totalMedioPago: summary.totalComprobante,
        },
      ],
    },
  };
  const validation = validateFacturaInput(invoice);
  if (!validation.valid) {
    throw new Error(`invalid fixture invoice: ${JSON.stringify(validation.errors)}`);
  }
  const xml = buildFacturaXml(invoice);
  parseDocumentXml(xml);
  return {
    xml,
    clave: invoice.clave,
    totalComprobante: summary.totalComprobante,
  };
}

async function seedSchemaVersion(client: Sql): Promise<void> {
  await client`
    INSERT INTO qum_schema_versions (id, schema_name, semver, sha256, json_schema)
    VALUES (
      ${SCHEMA_V1}::uuid,
      'exodus-raw',
      '1.0.0',
      ${"b".repeat(64)},
      '{}'::jsonb
    )
    ON CONFLICT DO NOTHING
  `;
}

async function insertFeXmlSource(client: Sql, tenantId: string): Promise<string> {
  const id = randomUUID();
  await withTenantTransaction(client, tenantId, async (db) => {
    await db.insert(qumDataSources).values({
      id,
      tenantId,
      name: "facturas_xml",
      sourceKind: "fe_xml",
    });
  });
  return id;
}

describe.sequential("T-DATA-003 / T-SEC-003 — importador XML FE vía hacienda-sdk", () => {
  let client: Sql;
  let casRoot: string;
  let fixtureDir: string;
  let sourceId: string;
  let importer: FeXmlSourceImporter;

  beforeAll(async () => {
    client = await resetAndMigrate();
    await seedTenants(client);
    await seedSchemaVersion(client);
    sourceId = await insertFeXmlSource(client, TENANT_A);
  });

  afterAll(async () => {
    await importer?.close();
    await client?.end();
  });

  beforeEach(async () => {
    casRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-fexml-cas-"));
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-fexml-fix-"));
    importer = new FeXmlSourceImporter({
      client,
      artifactStore: new FsArtifactStore(casRoot),
    });
  });

  afterEach(async () => {
    await fs.rm(casRoot, { recursive: true, force: true });
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it("importa FE 4.4 mínimo: clave 50 dígitos, emisor, receptor y totales", async () => {
    const { xml, clave, totalComprobante } = buildMinimalFe44Xml();
    const filePath = path.join(fixtureDir, "factura_min.fe44.xml");
    await fs.writeFile(filePath, xml, "utf8");

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
      originalName: "factura_min.fe44.xml",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.counts.totalRowsSeen).toBe(1);
    expect(result.data.counts.parsedOk).toBe(1);
    expect(result.data.counts.parseErrors).toBe(0);
    expect(
      result.data.counts.totalRowsSeen,
    ).toBe(
      result.data.counts.parsedOk +
        result.data.counts.parseErrors +
        result.data.counts.skippedEmpty,
    );

    const rows = await withTenantTransaction(client, TENANT_A, async (db) => {
      return db
        .select()
        .from(qumRawRecords)
        .where(eq(qumRawRecords.batchId, result.data.batchId));
    });

    expect(rows).toHaveLength(1);
    const record = rows[0]!;
    expect(record.parseStatus).toBe("OK");
    expect(record.sourceLocator).toBe(`fe_xml:clave:${clave}`);
    expect(record.rawPayload.clave).toBe(clave);
    expect(record.rawPayload.feVersion).toBe("4.4");
    expect(record.rawPayload.emisor).toMatchObject({
      nombre: SYNTHETIC_ORDER.emisor.nombre,
      numeroIdentificacion: SYNTHETIC_ORDER.emisor.identificacion.numero,
    });
    expect(record.rawPayload.receptor).toMatchObject({
      nombre: SYNTHETIC_ORDER.receptor.nombre,
      numeroIdentificacion: SYNTHETIC_ORDER.receptor.identificacion.numero,
    });
    const totales = record.rawPayload.totales as Record<string, unknown>;
    expect(totales.totalComprobante).toBe(totalComprobante);
    const lineas = record.rawPayload.lineas as Array<Record<string, unknown>>;
    expect(lineas[0]?.codigoCabys).toBe("8310100000000");
  });

  it("rechaza XML con DOCTYPE antes de invocar el SDK (ERR_SEC_XXE_REJECTED)", async () => {
    const { xml } = buildMinimalFe44Xml();
    const malicious = `<?xml version="1.0"?>\n<!DOCTYPE foo [<!ENTITY xxe "pwned">]>\n${xml.replace(/^<\?xml[^>]*>\s*/i, "")}`;

    expect(() => assertFeXmlSafeForParsing(malicious)).toThrow();

    const filePath = path.join(fixtureDir, "xxe.xml");
    await fs.writeFile(filePath, malicious, "utf8");

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_SEC_XXE_REJECTED");
    expect(result.error.category).toBe("SECURITY");
  });

  it("FE 4.3 heredado: advertencia WARN_XML_LEGACY_V43 sin descartar", async () => {
    const { clave } = buildMinimalFe44Xml();
    const legacyXml = `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.3/facturaElectronica">
  <Clave>${clave}</Clave>
  <Emisor>
    <Nombre>${SYNTHETIC_ORDER.emisor.nombre}</Nombre>
    <Identificacion>
      <Tipo>${SYNTHETIC_ORDER.emisor.identificacion.tipo}</Tipo>
      <Numero>${SYNTHETIC_ORDER.emisor.identificacion.numero}</Numero>
    </Identificacion>
  </Emisor>
  <Receptor>
    <Nombre>${SYNTHETIC_ORDER.receptor.nombre}</Nombre>
    <Identificacion>
      <Tipo>${SYNTHETIC_ORDER.receptor.identificacion.tipo}</Tipo>
      <Numero>${SYNTHETIC_ORDER.receptor.identificacion.numero}</Numero>
    </Identificacion>
  </Receptor>
  <ResumenFactura>
    <TotalComprobante>11300</TotalComprobante>
  </ResumenFactura>
</FacturaElectronica>`;

    const filePath = path.join(fixtureDir, "legacy_v43.xml");
    await fs.writeFile(filePath, legacyXml, "utf8");

    const result = await importer.import({
      tenantId: TENANT_A,
      sourceId,
      schemaVersionId: SCHEMA_V1,
      filePath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === "WARN_XML_LEGACY_V43")).toBe(true);
    expect(result.data.counts.parsedOk).toBe(1);

    const rows = await withTenantTransaction(client, TENANT_A, async (db) => {
      return db
        .select()
        .from(qumRawRecords)
        .where(eq(qumRawRecords.batchId, result.data.batchId));
    });
    expect(rows[0]?.rawPayload.clave).toBe(clave);
    expect(rows[0]?.rawPayload.feVersion).toBe("4.3");
  });
});