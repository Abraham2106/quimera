import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/api/app.js";
import { redactPiiInText } from "../../src/api/logging/pii-redact.js";
import { readCustomerPii } from "../../src/api/services/pii-pseudonymize.js";
import { withOfiTenantTransaction } from "../../src/db/connection.js";
import { apiTestHeaders, setupApiDb, TENANT_ID } from "./helpers.js";

describe("QR-SEC-009 — seudonimización PII no fiscal", () => {
  let client: Sql;
  let dbAvailable = false;

  beforeAll(async () => {
    const setup = await setupApiDb();
    client = setup.client;
    dbAvailable = setup.dbAvailable;
  });

  afterAll(async () => {
    if (client) await client.end({ timeout: 2 });
  });

  it("seudonimiza phone/email por ADMIN sin alterar artefactos fiscales", async () => {
    if (!dbAvailable) return;

    const customerId = randomUUID();
    const artifactId = randomUUID();
    const fiscalSha = "ab".repeat(32);
    const phone = "+506 8888-1212";
    const email = "cliente.real@ejemplo.cr";

    await withOfiTenantTransaction(client, TENANT_ID, async (tx) => {
      await tx`
        INSERT INTO ofi_customers (id, tenant_id, legal_name, phone, email, tax_id)
        VALUES (
          ${customerId}::uuid,
          ${TENANT_ID}::uuid,
          'Contacto histórico sintético',
          ${phone},
          ${email},
          '3-101-123456'
        )
      `;
      await tx`
        INSERT INTO qum_artifacts (
          id, tenant_id, sha256, artifact_kind, original_name, mime_type, byte_size, storage_uri
        ) VALUES (
          ${artifactId}::uuid,
          ${TENANT_ID}::uuid,
          ${fiscalSha},
          'fe_xml_signed',
          'comprobante.xml',
          'application/xml',
          128,
          ${`s3://tenants/${TENANT_ID}/sha256/${fiscalSha.slice(0, 2)}/${fiscalSha.slice(2, 4)}/${fiscalSha}`}
        )
      `;
    });

    const app = createApp({ sql: client });
    const adminHeaders = apiTestHeaders("ADMIN");
    const forbidden = await app.request(`/api/v1/customers/${customerId}/pseudonymize`, {
      method: "POST",
      headers: apiTestHeaders("OPERATOR"),
    });
    expect(forbidden.status).toBe(403);

    const response = await app.request(`/api/v1/customers/${customerId}/pseudonymize`, {
      method: "POST",
      headers: adminHeaders,
    });
    expect(response.status).toBe(200);

    const after = await readCustomerPii(client, TENANT_ID, customerId);
    expect(after?.phone).not.toBe(phone);
    expect(after?.email).not.toBe(email);
    expect(after?.phone).toMatch(/^\+506000/);
    expect(after?.email).toContain("@redactado.local");
    expect(after?.legalName).toBe("Contacto histórico sintético");

    const artifacts = await withOfiTenantTransaction(client, TENANT_ID, async (tx) => {
      return tx<{ sha256: string }[]>`
        SELECT sha256 FROM qum_artifacts WHERE id = ${artifactId}::uuid
      `;
    });
    expect(artifacts[0]?.sha256).toBe(fiscalSha);

    const redactedLog = redactPiiInText(`contacto ${email} tel ${phone}`);
    expect(redactedLog).not.toContain(email);
    expect(redactedLog).not.toContain(phone);
    expect(redactedLog).toContain("[REDACTED_EMAIL]");
    expect(redactedLog).toContain("[REDACTED_PHONE]");
  });
});