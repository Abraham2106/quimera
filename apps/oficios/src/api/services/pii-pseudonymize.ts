import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";

import { formatPiiAuditLine } from "../logging/pii-redact.js";
import { withOfiTenantTransaction, type OficiosSql } from "../../db/connection.js";

const ACTIVE_WORK_ORDER_STATUSES = [
  "RECEIVED",
  "DIAGNOSED",
  "QUOTED",
  "APPROVED",
  "IN_PROGRESS",
  "VERIFIED",
] as const;

export type PseudonymizeCustomerResult =
  | { readonly status: "ok"; readonly customerId: string }
  | { readonly status: "not_found" }
  | { readonly status: "active_work_orders" };

function pseudonymEmail(customerId: string): string {
  const digest = createHash("sha256").update(customerId, "utf8").digest("hex").slice(0, 12);
  return `seudonimo+${digest}@redactado.local`;
}

function pseudonymPhone(customerId: string): string {
  const digest = createHash("sha256").update(`phone:${customerId}`, "utf8").digest("hex");
  const digits = digest.replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
  return `+506000${digits}`;
}

export async function pseudonymizeCustomerContact(
  sql: OficiosSql,
  tenantId: string,
  customerId: string,
  actorId: string,
): Promise<PseudonymizeCustomerResult> {
  const customers = await sql<{ id: string; phone: string | null; email: string | null }[]>`
    SELECT id::text, phone, email
    FROM ofi_customers
    WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid
  `;
  const customer = customers[0];
  if (!customer) return { status: "not_found" };

  const openOrders = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM ofi_work_orders
    WHERE tenant_id = ${tenantId}::uuid
      AND customer_id = ${customerId}::uuid
      AND status IN ${sql([...ACTIVE_WORK_ORDER_STATUSES])}
  `;
  if (Number(openOrders[0]?.count ?? "0") > 0) {
    return { status: "active_work_orders" };
  }

  const nextEmail = pseudonymEmail(customerId);
  const nextPhone = pseudonymPhone(customerId);

  await sql`
    UPDATE ofi_customers
    SET phone = ${nextPhone}, email = ${nextEmail}
    WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid
  `;

  const auditId = randomUUID();
  process.stderr.write(
    `${JSON.stringify({
      event: "pii.pseudonymize",
      auditId,
      tenantId,
      customerId,
      actorId,
      detail: formatPiiAuditLine({
        beforeEmail: customer.email,
        beforePhone: customer.phone,
        afterEmail: nextEmail,
        afterPhone: nextPhone,
      }),
    })}\n`,
  );

  return { status: "ok", customerId };
}

export async function readCustomerPii(
  sql: Sql,
  tenantId: string,
  customerId: string,
): Promise<{ phone: string | null; email: string | null; legalName: string } | null> {
  return withOfiTenantTransaction(sql, tenantId, async (tx) => {
    const rows = await tx<{ phone: string | null; email: string | null; legal_name: string }[]>`
      SELECT phone, email, legal_name
      FROM ofi_customers
      WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid
    `;
    const row = rows[0];
    if (!row) return null;
    return { phone: row.phone, email: row.email, legalName: row.legal_name };
  });
}