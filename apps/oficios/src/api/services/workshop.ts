import { createHash, randomUUID } from "node:crypto";

import type { OficiosSql } from "../../db/connection.js";

import type { WorkOrderRow } from "./work-order-store.js";

export type DiagnosisAttachmentInput = {
  readonly filename: string;
  readonly sha256: string;
  readonly contentBase64: string;
};

export type DiagnosisRecord = {
  readonly id: string;
  readonly notes: string;
  readonly measurements: Record<string, unknown>;
  readonly attachments: readonly {
    readonly id: string;
    readonly filename: string;
    readonly sha256: string;
    readonly byteLength: number;
  }[];
};

export type MaterialRecord = {
  readonly id: string;
  readonly cabysCode: string;
  readonly quantity: string;
  readonly unitPriceMinor: string;
  readonly taxRateBps: number;
};

export function taxRateToBps(value: string): number | null {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  const bps = Number(whole) * 10_000 + Number((frac + "0000").slice(0, 4));
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) return null;
  return bps;
}

export async function saveDiagnosis(
  sql: OficiosSql,
  tenantId: string,
  workOrderId: string,
  input: {
    notes: string;
    measurements: Record<string, unknown>;
    attachments: readonly DiagnosisAttachmentInput[];
  },
): Promise<DiagnosisRecord> {
  const diagnosisId = randomUUID();
  const storedAttachments: DiagnosisRecord["attachments"][number][] = [];
  for (const attachment of input.attachments) {
    if (!/^[a-f0-9]{64}$/.test(attachment.sha256)) {
      throw new Error("ERR_ATTACHMENT_SHA256");
    }
    const bytes = Buffer.from(attachment.contentBase64, "base64");
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== attachment.sha256) {
      throw new Error("ERR_ATTACHMENT_SHA256");
    }
    storedAttachments.push({
      id: randomUUID(),
      filename: attachment.filename,
      sha256: digest,
      byteLength: bytes.byteLength,
    });
  }

  await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  await sql`
    INSERT INTO ofi_diagnoses (id, tenant_id, work_order_id, notes, measurements_json)
    VALUES (
      ${diagnosisId}::uuid,
      ${tenantId}::uuid,
      ${workOrderId}::uuid,
      ${input.notes},
      ${sql.json(JSON.parse(JSON.stringify(input.measurements)) as never)}
    )
  `;
  for (const attachment of storedAttachments) {
    await sql`
      INSERT INTO ofi_diagnosis_attachments (
        id, tenant_id, diagnosis_id, filename, sha256, byte_length
      )
      VALUES (
        ${attachment.id}::uuid,
        ${tenantId}::uuid,
        ${diagnosisId}::uuid,
        ${attachment.filename},
        ${attachment.sha256},
        ${attachment.byteLength}
      )
    `;
  }

  return {
    id: diagnosisId,
    notes: input.notes,
    measurements: input.measurements,
    attachments: storedAttachments,
  };
}

export async function saveMaterial(
  sql: OficiosSql,
  tenantId: string,
  workOrderId: string,
  input: {
    cabysCode: string;
    quantity: string;
    unitPriceMinor: number;
    taxRateBps: number;
  },
): Promise<MaterialRecord> {
  if (!/^[0-9]{8}$/.test(input.cabysCode) && !/^[0-9]{13}$/.test(input.cabysCode)) {
    throw new Error("ERR_CABYS_CODE");
  }
  if (!/^[0-9]+(\.[0-9]{1,4})?$/.test(input.quantity)) {
    throw new Error("ERR_QUANTITY");
  }
  if (!Number.isInteger(input.unitPriceMinor) || input.unitPriceMinor < 0) {
    throw new Error("ERR_UNIT_PRICE");
  }
  const id = randomUUID();
  await sql`
    INSERT INTO ofi_materials (
      id, tenant_id, work_order_id, cabys_code, quantity_text, unit_price_minor, tax_rate_bps
    )
    VALUES (
      ${id}::uuid,
      ${tenantId}::uuid,
      ${workOrderId}::uuid,
      ${input.cabysCode},
      ${input.quantity},
      ${input.unitPriceMinor},
      ${input.taxRateBps}
    )
  `;
  return {
    id,
    cabysCode: input.cabysCode,
    quantity: input.quantity,
    unitPriceMinor: String(input.unitPriceMinor),
    taxRateBps: input.taxRateBps,
  };
}

export async function listDiagnoses(
  sql: OficiosSql,
  tenantId: string,
  workOrderId: string,
): Promise<DiagnosisRecord[]> {
  const rows = await sql<
    { id: string; notes: string; measurements_json: Record<string, unknown> }[]
  >`
    SELECT id::text, notes, measurements_json
    FROM ofi_diagnoses
    WHERE tenant_id = ${tenantId}::uuid AND work_order_id = ${workOrderId}::uuid
    ORDER BY created_at ASC
  `;
  const result: DiagnosisRecord[] = [];
  for (const row of rows) {
    const attachments = await sql<
      { id: string; filename: string; sha256: string; byte_length: number }[]
    >`
      SELECT id::text, filename, sha256, byte_length
      FROM ofi_diagnosis_attachments
      WHERE tenant_id = ${tenantId}::uuid AND diagnosis_id = ${row.id}::uuid
      ORDER BY created_at ASC
    `;
    result.push({
      id: row.id,
      notes: row.notes,
      measurements: row.measurements_json ?? {},
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        sha256: attachment.sha256,
        byteLength: attachment.byte_length,
      })),
    });
  }
  return result;
}

export async function listMaterials(
  sql: OficiosSql,
  tenantId: string,
  workOrderId: string,
): Promise<MaterialRecord[]> {
  const rows = await sql<
    {
      id: string;
      cabys_code: string;
      quantity_text: string;
      unit_price_minor: string;
      tax_rate_bps: number;
    }[]
  >`
    SELECT id::text, cabys_code, quantity_text, unit_price_minor::text, tax_rate_bps
    FROM ofi_materials
    WHERE tenant_id = ${tenantId}::uuid AND work_order_id = ${workOrderId}::uuid
    ORDER BY created_at ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    cabysCode: row.cabys_code,
    quantity: row.quantity_text,
    unitPriceMinor: row.unit_price_minor,
    taxRateBps: row.tax_rate_bps,
  }));
}

export async function listWorkOrders(sql: OficiosSql, tenantId: string): Promise<WorkOrderRow[]> {
  return sql<WorkOrderRow[]>`
    SELECT
      id,
      tenant_id,
      customer_id,
      equipment_id,
      trade_contract_id,
      status,
      customer_authorized,
      version::text,
      fiscal_intent_id::text
    FROM ofi_work_orders
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at DESC
  `;
}

export type CustomerListItem = {
  readonly id: string;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly provenanceEntityId: string | null;
};

export type EquipmentListItem = {
  readonly id: string;
  readonly serialNumber: string | null;
  readonly tradeContractId: string;
};

export async function listEquipment(
  sql: OficiosSql,
  tenantId: string,
  customerId: string,
): Promise<EquipmentListItem[] | "not_found"> {
  const customers = await sql<{ id: string }[]>`
    SELECT id::text FROM ofi_customers
    WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid
  `;
  if (!customers[0]) return "not_found";
  const rows = await sql<
    { id: string; serial_number: string | null; trade_contract_id: string }[]
  >`
    SELECT id::text, serial_number, trade_contract_id
    FROM ofi_equipment
    WHERE tenant_id = ${tenantId}::uuid AND customer_id = ${customerId}::uuid
    ORDER BY created_at ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    serialNumber: row.serial_number,
    tradeContractId: row.trade_contract_id,
  }));
}

export async function listCustomers(sql: OficiosSql, tenantId: string): Promise<CustomerListItem[]> {
  const rows = await sql<
    {
      id: string;
      legal_name: string;
      tax_id: string | null;
      provenance_entity_id: string | null;
    }[]
  >`
    SELECT id::text, legal_name, tax_id, provenance_entity_id::text
    FROM ofi_customers
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY legal_name ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    legalName: row.legal_name,
    taxId: row.tax_id,
    provenanceEntityId: row.provenance_entity_id,
  }));
}

export async function loadWorkOrderContext(
  sql: OficiosSql,
  tenantId: string,
  workOrderId: string,
): Promise<{
  customerLegalName: string;
  equipmentSerial: string | null;
} | null> {
  const rows = await sql<{ legal_name: string; serial_number: string | null }[]>`
    SELECT c.legal_name, e.serial_number
    FROM ofi_work_orders w
    JOIN ofi_customers c ON c.id = w.customer_id AND c.tenant_id = w.tenant_id
    JOIN ofi_equipment e ON e.id = w.equipment_id AND e.tenant_id = w.tenant_id
    WHERE w.id = ${workOrderId}::uuid AND w.tenant_id = ${tenantId}::uuid
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    customerLegalName: row.legal_name,
    equipmentSerial: row.serial_number,
  };
}
