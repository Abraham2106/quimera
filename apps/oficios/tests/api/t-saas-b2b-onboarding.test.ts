import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { HVAC_REFRIGERATION_V1_CONTRACT_ID } from "../../src/domain/hvac-refrigeration-v1.js";
import {
  ERR_INVITATION_CONFLICT,
  ERR_INVITATION_GONE,
  ERR_LAST_ADMIN,
  ERR_ORG_SUSPENDED,
} from "../../src/api/errors.js";
import { withOfiTenantTransaction } from "../../src/db/connection.js";
import {
  apiTestHeaders,
  resetApiSchema,
  seedCustomerEquipment,
  setupApiDb,
  TENANT_ID,
} from "./helpers.js";
import {
  acceptInvitation,
  forceExpireInvitationForTests,
} from "../../src/api/services/saas-invitations.js";
import { countPartialRowsAfterFailedProvision } from "../../src/api/services/saas-members.js";
import { provisionOrganization } from "../../src/api/services/saas-org.js";

function bootstrapHeaders(actorId: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-actor-id": actorId,
  };
}

function adminHeaders(actorId = "admin-sub"): Record<string, string> {
  return {
    ...apiTestHeaders("ADMIN"),
    "x-actor-id": actorId,
  };
}

describe("T-SAAS — onboarding B2B", () => {
  let client: Sql;
  let dbAvailable: boolean;

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  it("provisioning atómico con cédula válida", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const app = createApp({ sql: client });
    const res = await app.request("/api/v1/org/register", {
      method: "POST",
      headers: bootstrapHeaders("founder-a"),
      body: JSON.stringify({
        commercialName: "Taller Frío SA",
        legalName: "Taller Frío Sociedad Anónima",
        taxIdentification: "3-101-123456",
        economicActivity: "452011",
        tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
        slug: `taller-${Date.now()}`,
      }),
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { organization: { tenantId: string } };
    expect(json.organization.tenantId).toMatch(/^[0-9a-f-]{36}$/i);

    const members = await withOfiTenantTransaction(
      client,
      json.organization.tenantId,
      async (tx) =>
        tx<{ user_sub: string; role: string }[]>`
          SELECT user_sub, role FROM saas_memberships WHERE status = 'active'
        `,
    );
    expect(members).toHaveLength(1);
    expect(members[0]?.user_sub).toBe("founder-a");
    expect(members[0]?.role).toBe("ADMIN");
  });

  it("cédula inválida → HTTP 400 sin filas parciales", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const slug = `invalid-tax-${Date.now()}`;
    const app = createApp({ sql: client });
    const res = await app.request("/api/v1/org/register", {
      method: "POST",
      headers: bootstrapHeaders("founder-b"),
      body: JSON.stringify({
        commercialName: "PYME X",
        legalName: "PYME X",
        taxIdentification: "ABC",
        economicActivity: "452011",
        tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
        slug,
      }),
    });
    expect(res.status).toBe(400);
    const leftover = await countPartialRowsAfterFailedProvision(client, slug);
    expect(leftover).toBe(0);
  });

  it("invitación expirada → 410 y reusada → 409", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const slug = `invite-${Date.now()}`;
    const provisioned = await provisionOrganization(client, "invite-admin", {
      commercialName: "Inv",
      legalName: "Inv",
      taxIdentification: "3101123456",
      economicActivity: "452011",
      tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
      slug,
      timezone: "America/Costa_Rica",
    });
    expect(provisioned.ok).toBe(true);
    if (!provisioned.ok) {
      return;
    }
    const tenantId = provisioned.organization.tenantId;

    const app = createApp({ sql: client });
    const createRes = await app.request("/api/v1/invitations", {
      method: "POST",
      headers: {
        ...apiTestHeaders("ADMIN"),
        "x-tenant-id": tenantId,
        "x-actor-id": "invite-admin",
      },
      body: JSON.stringify({
        email: "tecnico@ejemplo.cr",
        role: "OPERATOR",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      invitation: { token: string };
    };

    await forceExpireInvitationForTests(client, created.invitation.token);

    const expiredRes = await app.request("/api/v1/invitations/accept", {
      method: "POST",
      headers: bootstrapHeaders("invitee-1"),
      body: JSON.stringify({ token: created.invitation.token }),
    });
    expect(expiredRes.status).toBe(410);
    const expiredJson = (await expiredRes.json()) as { error: { code: string } };
    expect(expiredJson.error.code).toBe(ERR_INVITATION_GONE);

    const fresh = await app.request("/api/v1/invitations", {
      method: "POST",
      headers: {
        ...apiTestHeaders("ADMIN"),
        "x-tenant-id": tenantId,
        "x-actor-id": "invite-admin",
      },
      body: JSON.stringify({ email: "otro@ejemplo.cr", role: "OPERATOR" }),
    });
    const freshToken = ((await fresh.json()) as { invitation: { token: string } })
      .invitation.token;

    const accept1 = await acceptInvitation(client, "invitee-2", freshToken);
    expect(accept1.ok).toBe(true);

    const reusedRes = await app.request("/api/v1/invitations/accept", {
      method: "POST",
      headers: bootstrapHeaders("invitee-3"),
      body: JSON.stringify({ token: freshToken }),
    });
    expect(reusedRes.status).toBe(409);
    const reusedJson = (await reusedRes.json()) as { error: { code: string } };
    expect(reusedJson.error.code).toBe(ERR_INVITATION_CONFLICT);

    const dupCount = await withOfiTenantTransaction(client, tenantId, async (tx) =>
      tx<{ count: string }[]>`
        SELECT count(*)::text AS count FROM saas_memberships
        WHERE user_sub = 'invitee-2' AND status = 'active'
      `,
    );
    expect(Number(dupCount[0]?.count ?? "0")).toBe(1);
  });

  it("último ADMIN no puede degradarse → 409", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const slug = `last-admin-${Date.now()}`;
    const provisioned = await provisionOrganization(client, "solo-admin", {
      commercialName: "Solo",
      legalName: "Solo",
      taxIdentification: "3101987654",
      economicActivity: "452011",
      tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
      slug,
      timezone: "America/Costa_Rica",
    });
    if (!provisioned.ok) {
      throw new Error("provision failed");
    }
    const tenantId = provisioned.organization.tenantId;
    const app = createApp({ sql: client });

    const patchRes = await app.request(
      `/api/v1/org/members/${encodeURIComponent("solo-admin")}`,
      {
        method: "PATCH",
        headers: {
          ...adminHeaders("solo-admin"),
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ role: "OPERATOR" }),
      },
    );
    expect(patchRes.status).toBe(409);
    const json = (await patchRes.json()) as { error: { code: string } };
    expect(json.error.code).toBe(ERR_LAST_ADMIN);
  });

  it("suspensión bloquea mutación operativa y ADMIN exporta", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    await resetApiSchema(client);
    await withOfiTenantTransaction(client, TENANT_ID, async (tx) => {
      await tx`
        INSERT INTO saas_organizations (
          tenant_id, commercial_name, legal_name, cr_id_normalized,
          economic_activity, trade_contract_id, status
        )
        VALUES (
          ${TENANT_ID}::uuid,
          'Test',
          'Test Legal',
          '3101123456',
          '452011',
          ${HVAC_REFRIGERATION_V1_CONTRACT_ID},
          'suspended'
        )
      `;
      await tx`
        INSERT INTO saas_memberships (id, tenant_id, user_sub, role, status)
        VALUES (gen_random_uuid(), ${TENANT_ID}::uuid, 'admin-sub', 'ADMIN', 'active')
      `;
    });
    const { customerId, equipmentId } = await seedCustomerEquipment(client);

    const app = createApp({ sql: client });
    const woRes = await app.request("/api/v1/work-orders", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ customerId, equipmentId }),
    });
    expect(woRes.status).toBe(403);
    const woJson = (await woRes.json()) as { error: { code: string } };
    expect(woJson.error.code).toBe(ERR_ORG_SUSPENDED);

    const exportRes = await app.request("/api/v1/org/export", {
      headers: adminHeaders(),
    });
    expect(exportRes.status).toBe(200);
    const exportJson = (await exportRes.json()) as { export: { organization: { status: string } } };
    expect(exportJson.export.organization.status).toBe("suspended");
  });

  it("aislamiento cross-tenant en membresías e invitaciones", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const tenantA = await provisionOrganization(client, "owner-a", {
      commercialName: "A",
      legalName: "A",
      taxIdentification: "3101111111",
      economicActivity: "452011",
      tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
      slug: `iso-a-${Date.now()}`,
      timezone: "America/Costa_Rica",
    });
    const tenantB = await provisionOrganization(client, "owner-b", {
      commercialName: "B",
      legalName: "B",
      taxIdentification: "3101222222",
      economicActivity: "452011",
      tradeContractId: HVAC_REFRIGERATION_V1_CONTRACT_ID,
      slug: `iso-b-${Date.now()}`,
      timezone: "America/Costa_Rica",
    });
    if (!tenantA.ok || !tenantB.ok) {
      throw new Error("provision");
    }

    const visibleFromA = await withOfiTenantTransaction(
      client,
      tenantA.organization.tenantId,
      async (tx) =>
        tx<{ user_sub: string }[]>`
          SELECT user_sub FROM saas_memberships
        `,
    );
    expect(visibleFromA.every((m) => m.user_sub === "owner-a")).toBe(true);
    expect(visibleFromA.some((m) => m.user_sub === "owner-b")).toBe(false);

    const app = createApp({ sql: client });
    const inviteRes = await app.request("/api/v1/invitations", {
      method: "POST",
      headers: {
        ...apiTestHeaders("ADMIN"),
        "x-tenant-id": tenantB.organization.tenantId,
        "x-actor-id": "owner-b",
      },
      body: JSON.stringify({ email: "x@y.cr", role: "OPERATOR" }),
    });
    const tokenB = ((await inviteRes.json()) as { invitation: { token: string } })
      .invitation.token;

    const leak = await withOfiTenantTransaction(
      client,
      tenantA.organization.tenantId,
      async (tx) =>
        tx<{ count: string }[]>`
          SELECT count(*)::text AS count FROM saas_invitations
        `,
    );
    expect(Number(leak[0]?.count ?? "0")).toBe(0);

    const acceptFromA = await acceptInvitation(client, "stranger", tokenB);
    expect(acceptFromA.ok).toBe(true);
    if (acceptFromA.ok) {
      expect(acceptFromA.tenantId).toBe(tenantB.organization.tenantId);
    }
  });
});