import type { OficiosSql } from "../../db/connection.js";
import { loadOrganizationProfile } from "./saas-org.js";

export type TenantExportBundle = {
  readonly exportedAt: string;
  readonly organization: NonNullable<Awaited<ReturnType<typeof loadOrganizationProfile>>>;
  readonly customers: readonly Record<string, unknown>[];
  readonly workOrders: readonly Record<string, unknown>[];
  readonly provenanceEntryCount: number;
};

export async function buildTenantExport(
  sql: OficiosSql,
  tenantId: string,
): Promise<TenantExportBundle | null> {
  const organization = await loadOrganizationProfile(sql, tenantId);
  if (!organization) {
    return null;
  }

  const customers = await sql<
    Record<string, unknown>[]
  >`
    SELECT
      id::text AS id,
      legal_name AS "legalName",
      provenance_entity_id::text AS "provenanceEntityId",
      created_at AS "createdAt"
    FROM ofi_customers
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at
  `;

  const workOrders = await sql<
    Record<string, unknown>[]
  >`
    SELECT
      id::text AS id,
      customer_id::text AS "customerId",
      equipment_id::text AS "equipmentId",
      status,
      version,
      created_at AS "createdAt"
    FROM ofi_work_orders
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at
  `;

  const prov = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM qum_provenance_entries
    WHERE tenant_id = ${tenantId}::uuid
  `;

  return {
    exportedAt: new Date().toISOString(),
    organization,
    customers,
    workOrders,
    provenanceEntryCount: Number(prov[0]?.count ?? "0"),
  };
}