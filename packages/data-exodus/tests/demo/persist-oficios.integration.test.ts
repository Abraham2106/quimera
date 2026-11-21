import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient } from "../../src/db/connection.js";
import { persistDemoHvacToOficios } from "../../src/demo/persist-oficios.js";
import {
  ensureEvidenceAppendOnlyMigration,
  isInsufficientPrivilegeError,
} from "../db/evidence-append-only-helpers.js";

describe("persistencia demo-hvac hacia OficiOS", () => {
  let sql: Sql;
  const tenantId = randomUUID();

  beforeAll(async () => {
    sql = createPostgresClient();
    await ensureEvidenceAppendOnlyMigration(sql);
    await sql.unsafe("ALTER TABLE qum_provenance_entries DISABLE TRIGGER qum_append_only_qum_provenance_entries");
    await sql.unsafe("ALTER TABLE qum_artifacts DISABLE TRIGGER qum_append_only_qum_artifacts");
    await sql.unsafe("ALTER TABLE qum_provenance_entries NO FORCE ROW LEVEL SECURITY");
    await sql.unsafe("ALTER TABLE qum_artifacts NO FORCE ROW LEVEL SECURITY");
    await sql`DELETE FROM qum_provenance_entries WHERE artifact_id IN (SELECT id FROM qum_artifacts WHERE storage_uri LIKE 'cas://demo-hvac-1000/%')`;
    await sql`DELETE FROM qum_artifacts WHERE storage_uri LIKE 'cas://demo-hvac-1000/%'`;
    await sql.unsafe("ALTER TABLE qum_provenance_entries FORCE ROW LEVEL SECURITY");
    await sql.unsafe("ALTER TABLE qum_artifacts FORCE ROW LEVEL SECURITY");
    await sql.unsafe("ALTER TABLE qum_provenance_entries ENABLE TRIGGER qum_append_only_qum_provenance_entries");
    await sql.unsafe("ALTER TABLE qum_artifacts ENABLE TRIGGER qum_append_only_qum_artifacts");
    await sql`
      INSERT INTO qum_tenants (id, slug, display_name)
      VALUES (${tenantId}::uuid, ${`demo-persist-${tenantId.slice(0, 8)}`}, 'Demo persist')
    `;
  });

  afterAll(async () => {
    await sql.end({ timeout: 2 });
  });

  it("guarda clientes con archivo y fila de origen, y repetir no duplica", async () => {
    const first = await persistDemoHvacToOficios(sql, tenantId);
    expect(first.customers).toBeGreaterThan(0);
    expect(first.equipment).toBe(first.customers);

    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx<{ legal_name: string; original_name: string; locator: string }[]>`
        SELECT c.legal_name, a.original_name, e.metadata_json->>'sourceLocator' AS locator
        FROM ofi_customers c
        JOIN qum_provenance_entries e ON e.entity_id = c.provenance_entity_id
        JOIN qum_artifacts a ON a.id = e.artifact_id
        WHERE c.tenant_id = ${tenantId}::uuid
        LIMIT 5
      `;
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.original_name.length > 0 && row.locator.includes("#"))).toBe(true);

    const second = await persistDemoHvacToOficios(sql, tenantId);
    expect(second.customers).toBe(0);
  });

  it("bloquea UPDATE/DELETE en qum_artifacts visibles por RLS", async () => {
    const artifactRows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx<{ id: string }[]>`
        SELECT id::text FROM qum_artifacts WHERE tenant_id = ${tenantId}::uuid LIMIT 1
      `;
    });
    const artifactId = artifactRows[0]?.id;
    expect(artifactId).toBeDefined();
    if (!artifactId) return;

    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        await tx`
          UPDATE qum_artifacts SET byte_size = byte_size + 1
          WHERE id = ${artifactId}::uuid
        `;
      }),
    ).rejects.toSatisfy(isInsufficientPrivilegeError);

    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        await tx`DELETE FROM qum_artifacts WHERE id = ${artifactId}::uuid`;
      }),
    ).rejects.toSatisfy(isInsufficientPrivilegeError);
  });
});