import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { createFiscalCredentialVault } from "../../src/vault/create-fiscal-vault.js";
import { withFobTenantTransaction } from "../../src/db/connection.js";
import { upsertFiscalCredentials } from "../../src/store/pg-fiscal-credentials.js";
import { resetFobSchema, seedTenant, TENANT_A } from "../store/helpers.js";

export const TENANT_B = "22222222-2222-7222-8222-222222222222";

const ISSUER = "3101000099";

describe.sequential("T-SEC-FOB-CRED — RLS fob_fiscal_credentials", () => {
  let client: Sql | undefined;
  const vault = createFiscalCredentialVault();

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client, TENANT_A);
    await seedTenant(client, TENANT_B, "tenant-b-cred");
    const p12 = Buffer.from([0x30, 0x82, 0x01, 0x00, 0x02]);
    const notAfter = new Date("2027-01-01T00:00:00.000Z");
    await upsertFiscalCredentials(client, vault, {
      tenantId: TENANT_A,
      issuerId: ISSUER,
      environment: "sandbox",
      p12,
      pin: "PIN-A",
      idpUsername: "user-a",
      idpPassword: "pass-a",
      certNotAfter: notAfter,
    });
    await upsertFiscalCredentials(client, vault, {
      tenantId: TENANT_B,
      issuerId: ISSUER,
      environment: "sandbox",
      p12: randomBytes(8),
      pin: "PIN-B",
      idpUsername: "user-b",
      idpPassword: "pass-b",
      certNotAfter: notAfter,
    });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("con contexto A no lee credenciales del tenant B", async () => {
    if (!client) throw new Error("no client");
    const rows = await withFobTenantTransaction(client, TENANT_A, async (tx) =>
      tx<{ issuer_id: string; kind: string }[]>`
        SELECT issuer_id, kind FROM fob_fiscal_credentials ORDER BY kind
      `,
    );
    expect(rows.every((row) => row.issuer_id === ISSUER)).toBe(true);
    expect(rows.length).toBe(4);
  });

  it("sin app.current_tenant_id no devuelve filas", async () => {
    if (!client) throw new Error("no client");
    const rows = await client<{ count: string }[]>`
      SELECT count(*)::text AS count FROM fob_fiscal_credentials
    `;
    expect(Number(rows[0]?.count ?? "0")).toBe(0);
  });
});