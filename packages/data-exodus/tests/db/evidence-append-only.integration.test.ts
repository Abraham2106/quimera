import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { createPostgresClient } from "../../src/db/connection.js";
import {
  ensureEvidenceAppendOnlyMigration,
  isInsufficientPrivilegeError,
  withEvidenceTablesUnlocked,
} from "./evidence-append-only-helpers.js";

describe("QR-SEC-005 — tablas de evidencia append-only en PostgreSQL", () => {
  let sql: Sql;
  const tenantId = randomUUID();
  let artifactId: string;

  beforeAll(async () => {
    sql = createPostgresClient();
    await ensureEvidenceAppendOnlyMigration(sql);
    await sql`
      INSERT INTO qum_tenants (id, slug, display_name)
      VALUES (${tenantId}::uuid, ${`evidence-${tenantId.slice(0, 8)}`}, 'Evidence append-only test')
    `;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 2 });
  });

  it("rechaza UPDATE y DELETE con código 42501 bajo RLS del tenant", async () => {
    artifactId = randomUUID();
    const sha = "a".repeat(64);
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await tx`
        INSERT INTO qum_artifacts (
          id, tenant_id, sha256, artifact_kind, original_name, mime_type, byte_size, storage_uri
        ) VALUES (
          ${artifactId}::uuid,
          ${tenantId}::uuid,
          ${sha},
          'source_file',
          'evidence.csv',
          'text/csv',
          12,
          ${`cas://${sha}`}
        )
      `;
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        await tx`
          UPDATE qum_artifacts SET original_name = 'mutated'
          WHERE id = ${artifactId}::uuid AND tenant_id = ${tenantId}::uuid
        `;
      }),
    ).rejects.toSatisfy(isInsufficientPrivilegeError);

    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        await tx`
          DELETE FROM qum_artifacts
          WHERE id = ${artifactId}::uuid AND tenant_id = ${tenantId}::uuid
        `;
      }),
    ).rejects.toSatisfy(isInsufficientPrivilegeError);
  });
});