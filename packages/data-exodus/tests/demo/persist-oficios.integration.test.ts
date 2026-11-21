import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient } from "../../src/db/connection.js";
import { persistDemoHvacToOficios } from "../../src/demo/persist-oficios.js";

describe("persistencia demo-hvac hacia OficiOS", () => {
  let sql: Sql;
  const tenantId = randomUUID();

  beforeAll(async () => {
    sql = createPostgresClient();
    await sql`
      INSERT INTO qum_tenants (id, slug, display_name)
      VALUES (${tenantId}::uuid, ${`demo-persist-${tenantId.slice(0, 8)}`}, 'Demo persist')
    `;
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await tx`DELETE FROM ofi_equipment WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM ofi_customers WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM qum_provenance_entries WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM qum_entities WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM qum_artifacts WHERE tenant_id = ${tenantId}::uuid`;
    });
    await sql`DELETE FROM qum_tenants WHERE id = ${tenantId}::uuid`;
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
});