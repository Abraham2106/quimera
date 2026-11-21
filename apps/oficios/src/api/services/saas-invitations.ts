import { randomBytes, randomUUID } from "node:crypto";

import type { CreateInvitationBody, SaasMembershipRole } from "@quimera/core";

import type { Sql } from "postgres";

import type { OficiosSql } from "../../db/connection.js";
import {
  hashInvitationEmail,
  hashInvitationToken,
} from "./saas-org.js";

const DEFAULT_INVITE_HOURS = 72;

export type CreatedInvitation = {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: string;
  readonly role: SaasMembershipRole;
};

export async function createInvitation(
  sql: OficiosSql,
  tenantId: string,
  body: CreateInvitationBody,
): Promise<CreatedInvitation> {
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInvitationToken(token);
  const emailHash = hashInvitationEmail(body.email);
  const hours = body.expiresInHours ?? DEFAULT_INVITE_HOURS;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  await sql`
    INSERT INTO saas_invitations (
      id, tenant_id, email_hash, role, token_hash, expires_at
    )
    VALUES (
      ${id}::uuid,
      ${tenantId}::uuid,
      ${emailHash},
      ${body.role},
      ${tokenHash},
      ${expiresAt.toISOString()}::timestamptz
    )
  `;

  return {
    id,
    token,
    expiresAt: expiresAt.toISOString(),
    role: body.role,
  };
}

export type AcceptInvitationResult =
  | { ok: true; tenantId: string; role: SaasMembershipRole }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "revoked" }
  | { ok: false; reason: "consumed" };

export async function acceptInvitation(
  client: Sql,
  actorSub: string,
  rawToken: string,
): Promise<AcceptInvitationResult> {
  const tokenHash = hashInvitationToken(rawToken);
  const membershipId = randomUUID();

  return client.begin(async (tx) => {
      await tx`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`;

      const found = await tx<
        {
          id: string;
          tenant_id: string;
          role: SaasMembershipRole;
          expires_at: Date;
          accepted_at: Date | null;
          revoked_at: Date | null;
        }[]
      >`
        SELECT
          id::text,
          tenant_id::text,
          role,
          expires_at,
          accepted_at,
          revoked_at
        FROM saas_invitations
        WHERE token_hash = ${tokenHash}
      `;

      const row = found[0];
      if (!row) {
        return { ok: false as const, reason: "not_found" as const };
      }
      if (row.revoked_at) {
        return { ok: false as const, reason: "revoked" as const };
      }
      if (row.accepted_at) {
        return { ok: false as const, reason: "consumed" as const };
      }
      if (row.expires_at.getTime() <= Date.now()) {
        return { ok: false as const, reason: "expired" as const };
      }

      const tenantId = row.tenant_id;
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

      const locked = await tx<
        {
          accepted_at: Date | null;
          revoked_at: Date | null;
          expires_at: Date;
        }[]
      >`
        SELECT accepted_at, revoked_at, expires_at
        FROM saas_invitations
        WHERE token_hash = ${tokenHash}
        FOR UPDATE
      `;
      const invite = locked[0];
      if (!invite || invite.revoked_at || invite.accepted_at) {
        return { ok: false as const, reason: "consumed" as const };
      }
      if (invite.expires_at.getTime() <= Date.now()) {
        return { ok: false as const, reason: "expired" as const };
      }

      const existing = await tx<{ id: string; status: string }[]>`
        SELECT id::text, status
        FROM saas_memberships
        WHERE tenant_id = ${tenantId}::uuid AND user_sub = ${actorSub}
        FOR UPDATE
      `;
      if (existing[0]?.status === "active") {
        return { ok: false as const, reason: "consumed" as const };
      }

      if (existing[0]) {
        await tx`
          UPDATE saas_memberships
          SET role = ${row.role}, status = 'active'
          WHERE tenant_id = ${tenantId}::uuid AND user_sub = ${actorSub}
        `;
      } else {
        await tx`
          INSERT INTO saas_memberships (id, tenant_id, user_sub, role, status)
          VALUES (
            ${membershipId}::uuid,
            ${tenantId}::uuid,
            ${actorSub},
            ${row.role},
            'active'
          )
        `;
      }

      await tx`
        UPDATE saas_invitations
        SET accepted_at = now()
        WHERE token_hash = ${tokenHash}
      `;

      return { ok: true as const, tenantId, role: row.role };
    });
}

export async function revokeInvitation(
  sql: OficiosSql,
  tenantId: string,
  invitationId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE saas_invitations
    SET revoked_at = now()
    WHERE id = ${invitationId}::uuid
      AND tenant_id = ${tenantId}::uuid
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    RETURNING id::text
  `;
  return rows.length > 0;
}

export async function forceExpireInvitationForTests(
  client: Sql,
  token: string,
): Promise<void> {
  const tokenHash = hashInvitationToken(token);
  await client.begin(async (tx) => {
    await tx`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`;
    const rows = await tx<{ tenant_id: string }[]>`
      SELECT tenant_id::text FROM saas_invitations WHERE token_hash = ${tokenHash}
    `;
    const tenantId = rows[0]?.tenant_id;
    if (!tenantId) {
      return;
    }
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await tx`
      UPDATE saas_invitations
      SET expires_at = now() - interval '1 hour'
      WHERE token_hash = ${tokenHash}
    `;
  });
}