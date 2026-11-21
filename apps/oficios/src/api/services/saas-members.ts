import { randomUUID } from "node:crypto";

import type { SaasMembershipRole } from "@quimera/core";

import type { OficiosSql } from "../../db/connection.js";

export type MemberRow = {
  readonly userSub: string;
  readonly role: SaasMembershipRole;
  readonly status: "active" | "removed";
  readonly createdAt: string;
};

export async function listActiveMembers(
  sql: OficiosSql,
  tenantId: string,
): Promise<MemberRow[]> {
  const rows = await sql<
    {
      user_sub: string;
      role: SaasMembershipRole;
      status: "active" | "removed";
      created_at: Date;
    }[]
  >`
    SELECT user_sub, role, status, created_at
    FROM saas_memberships
    WHERE tenant_id = ${tenantId}::uuid AND status = 'active'
    ORDER BY created_at ASC
  `;
  return rows.map((row) => ({
    userSub: row.user_sub,
    role: row.role,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  }));
}

export type MemberMutationResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "last_admin" };

export async function updateMemberRole(
  sql: OficiosSql,
  tenantId: string,
  userSub: string,
  newRole: SaasMembershipRole,
): Promise<MemberMutationResult> {
  try {
    const target = await sql<
      { role: SaasMembershipRole; status: string }[]
    >`
      SELECT role, status
      FROM saas_memberships
      WHERE tenant_id = ${tenantId}::uuid AND user_sub = ${userSub}
      FOR UPDATE
    `;
    if (!target[0] || target[0].status !== "active") {
      throw new Error("not_found");
    }

    if (target[0].role === "ADMIN" && newRole !== "ADMIN") {
      const admins = await sql<{ user_sub: string }[]>`
        SELECT user_sub
        FROM saas_memberships
        WHERE tenant_id = ${tenantId}::uuid
          AND role = 'ADMIN'
          AND status = 'active'
        FOR UPDATE
      `;
      if (admins.length <= 1) {
        throw new Error("last_admin");
      }
    }

    await sql`
      UPDATE saas_memberships
      SET role = ${newRole}
      WHERE tenant_id = ${tenantId}::uuid AND user_sub = ${userSub}
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "not_found") {
      return { ok: false, reason: "not_found" };
    }
    if (message === "last_admin") {
      return { ok: false, reason: "last_admin" };
    }
    throw err;
  }
  return { ok: true };
}

export async function removeMember(
  sql: OficiosSql,
  tenantId: string,
  userSub: string,
): Promise<MemberMutationResult> {
  try {
    const target = await sql<
      { role: SaasMembershipRole; status: string }[]
    >`
      SELECT role, status
      FROM saas_memberships
      WHERE tenant_id = ${tenantId}::uuid AND user_sub = ${userSub}
      FOR UPDATE
    `;
    if (!target[0] || target[0].status !== "active") {
      throw new Error("not_found");
    }

    if (target[0].role === "ADMIN") {
      const admins = await sql<{ user_sub: string }[]>`
        SELECT user_sub
        FROM saas_memberships
        WHERE tenant_id = ${tenantId}::uuid
          AND role = 'ADMIN'
          AND status = 'active'
        FOR UPDATE
      `;
      if (admins.length <= 1) {
        throw new Error("last_admin");
      }
    }

    await sql`
      UPDATE saas_memberships
      SET status = 'removed'
      WHERE tenant_id = ${tenantId}::uuid AND user_sub = ${userSub}
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "not_found") {
      return { ok: false, reason: "not_found" };
    }
    if (message === "last_admin") {
      return { ok: false, reason: "last_admin" };
    }
    throw err;
  }
  return { ok: true };
}

export async function countPartialRowsAfterFailedProvision(
  client: OficiosSql,
  slug: string,
): Promise<number> {
  const tenants = await client<{ count: string }[]>`
    SELECT count(*)::text AS count FROM qum_tenants WHERE slug = ${slug}
  `;
  return Number(tenants[0]?.count ?? "0");
}

export async function insertMembershipForTest(
  sql: OficiosSql,
  tenantId: string,
  userSub: string,
  role: SaasMembershipRole,
): Promise<void> {
  await sql`
    INSERT INTO saas_memberships (id, tenant_id, user_sub, role, status)
    VALUES (
      ${randomUUID()}::uuid,
      ${tenantId}::uuid,
      ${userSub},
      ${role},
      'active'
    )
    ON CONFLICT (tenant_id, user_sub) DO UPDATE
    SET role = EXCLUDED.role, status = 'active'
  `;
}