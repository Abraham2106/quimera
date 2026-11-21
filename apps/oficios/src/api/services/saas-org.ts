import { createHash, randomUUID } from "node:crypto";

import {
  normalizeCrIdentification,
  type RegisterOrganizationBody,
  type SaasOrgStatus,
} from "@quimera/core";

import type { Sql } from "postgres";

import type { OficiosSql } from "../../db/connection.js";
export type ProvisionedOrganization = {
  readonly tenantId: string;
  readonly slug: string;
  readonly commercialName: string;
  readonly legalName: string;
  readonly crIdNormalized: string;
  readonly status: SaasOrgStatus;
};

export type OrganizationProfile = ProvisionedOrganization & {
  readonly economicActivity: string;
  readonly tradeContractId: string;
  readonly timezone: string;
};

export async function provisionOrganization(
  client: Sql,
  actorSub: string,
  body: RegisterOrganizationBody,
): Promise<
  | { ok: true; organization: ProvisionedOrganization }
  | { ok: false; reason: "invalid_tax_id" }
> {
  const crId = normalizeCrIdentification(body.taxIdentification);
  if (!crId) {
    return { ok: false, reason: "invalid_tax_id" };
  }

  const tradeContractId = body.tradeContractId.trim();

  const tenantId = randomUUID();
  const membershipId = randomUUID();

  await client.begin(async (tx) => {
    await tx`
      INSERT INTO qum_tenants (id, slug, display_name)
      VALUES (${tenantId}::uuid, ${body.slug}, ${body.commercialName})
    `;
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await tx`
      INSERT INTO saas_organizations (
        tenant_id, commercial_name, legal_name, cr_id_normalized,
        economic_activity, trade_contract_id, status, timezone
      )
      VALUES (
        ${tenantId}::uuid,
        ${body.commercialName},
        ${body.legalName},
        ${crId},
        ${body.economicActivity},
        ${tradeContractId},
        'active',
        ${body.timezone ?? "America/Costa_Rica"}
      )
    `;
    await tx`
      INSERT INTO saas_memberships (id, tenant_id, user_sub, role, status)
      VALUES (
        ${membershipId}::uuid,
        ${tenantId}::uuid,
        ${actorSub},
        'ADMIN',
        'active'
      )
    `;
  });

  return {
    ok: true,
    organization: {
      tenantId,
      slug: body.slug,
      commercialName: body.commercialName,
      legalName: body.legalName,
      crIdNormalized: crId,
      status: "active",
    },
  };
}

export async function loadOrganizationStatus(
  sql: OficiosSql,
  tenantId: string,
): Promise<SaasOrgStatus | null> {
  const rows = await sql<{ status: SaasOrgStatus }[]>`
  SELECT status FROM saas_organizations
  WHERE tenant_id = ${tenantId}::uuid
`;
  return rows[0]?.status ?? null;
}

export async function loadOrganizationProfile(
  sql: OficiosSql,
  tenantId: string,
): Promise<OrganizationProfile | null> {
  const rows = await sql<
    {
      tenant_id: string;
      commercial_name: string;
      legal_name: string;
      cr_id_normalized: string;
      economic_activity: string;
      trade_contract_id: string;
      status: SaasOrgStatus;
      timezone: string;
      slug: string;
    }[]
  >`
    SELECT
      o.tenant_id::text,
      o.commercial_name,
      o.legal_name,
      o.cr_id_normalized,
      o.economic_activity,
      o.trade_contract_id,
      o.status,
      o.timezone,
      t.slug
    FROM saas_organizations o
    JOIN qum_tenants t ON t.id = o.tenant_id
    WHERE o.tenant_id = ${tenantId}::uuid
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    tenantId: row.tenant_id,
    slug: row.slug,
    commercialName: row.commercial_name,
    legalName: row.legal_name,
    crIdNormalized: row.cr_id_normalized,
    economicActivity: row.economic_activity,
    tradeContractId: row.trade_contract_id,
    status: row.status,
    timezone: row.timezone,
  };
}

export async function setOrganizationSuspended(
  sql: OficiosSql,
  tenantId: string,
): Promise<void> {
  await sql`
    UPDATE saas_organizations
    SET status = 'suspended'
    WHERE tenant_id = ${tenantId}::uuid
  `;
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashInvitationEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}