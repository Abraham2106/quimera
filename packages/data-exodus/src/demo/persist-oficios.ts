import { createHash } from "node:crypto";
import postgres, { type Sql } from "postgres";

import { resolveDatabaseUrl } from "../db/connection.js";
import { loadDemoHvac1000 } from "./load-demo-hvac-1000.js";
import { resolveDemoHvacFixtureRoot } from "./resolve-repo-root.js";

const HVAC_CONTRACT = "hvac-refrigeration-v1";

function uuidFromKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const SCHEMA_VERSION_ID = uuidFromKey("schema:oficios-v1@1.0.0");

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type PersistDemoHvacResult = {
  readonly customers: number;
  readonly equipment: number;
};

/**
 * Carga los clientes del fixture demo-hvac-1000 en ofi_customers con una
 * procedencia que apunta al archivo y a la fila de origen.
 */
export async function persistDemoHvacToOficios(
  client: Sql,
  tenantId: string,
): Promise<PersistDemoHvacResult> {
  const loaded = await loadDemoHvac1000(resolveDemoHvacFixtureRoot(import.meta.url));
  let customers = 0;
  let equipment = 0;

  await client.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS ofi_customers (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
        legal_name TEXT NOT NULL,
        tax_id TEXT,
        phone TEXT,
        email TEXT,
        provenance_entity_id UUID REFERENCES qum_entities(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS ofi_equipment (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES qum_tenants(id) ON DELETE RESTRICT,
        customer_id UUID NOT NULL REFERENCES ofi_customers(id) ON DELETE RESTRICT,
        trade_contract_id TEXT NOT NULL,
        serial_number TEXT,
        specs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        provenance_entity_id UUID REFERENCES qum_entities(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await tx`
      INSERT INTO qum_schema_versions (id, schema_name, semver, sha256, json_schema)
      VALUES (
        ${SCHEMA_VERSION_ID}::uuid,
        'oficios-v1',
        '1.0.0',
        ${sha256Hex("oficios-v1@1.0.0")},
        ${tx.json({ title: "oficios-v1" })}
      )
      ON CONFLICT (schema_name, semver) DO NOTHING
    `;
    const schemaRows = await tx<{ id: string }[]>`
      SELECT id::text AS id
      FROM qum_schema_versions
      WHERE schema_name = 'oficios-v1' AND semver = '1.0.0'
      LIMIT 1
    `;
    const schemaVersionId = schemaRows[0]?.id;
    if (!schemaVersionId) {
      throw new Error("ERR_SCHEMA_VERSION_MISSING");
    }

    const artifactIdByProvenance = new Map<string, string>();
    for (const row of loaded.dataset.clients) {
      for (const entry of row.provenance) {
        if (artifactIdByProvenance.has(entry.artifactId)) continue;
        const originalName = entry.sourceLocator.split("#")[0] || "origen";
        const digest = sha256Hex(entry.artifactId);
        const insertedArtifact = await tx<{ id: string }[]>`
          INSERT INTO qum_artifacts (
            id, tenant_id, sha256, artifact_kind, original_name, mime_type, byte_size, storage_uri
          )
          VALUES (
            ${entry.artifactId}::uuid,
            ${tenantId}::uuid,
            ${digest},
            'source_file',
            ${originalName},
            'application/octet-stream',
            0,
            ${`cas://demo-hvac-1000/${originalName}`}
          )
          ON CONFLICT (tenant_id, sha256, artifact_kind) DO NOTHING
          RETURNING id::text AS id
        `;
        const resolved =
          insertedArtifact[0]?.id ??
          (
            await tx<{ id: string }[]>`
              SELECT id::text AS id
              FROM qum_artifacts
              WHERE tenant_id = ${tenantId}::uuid
                AND sha256 = ${digest}
                AND artifact_kind = 'source_file'
              LIMIT 1
            `
          )[0]?.id;
        if (!resolved) {
          throw new Error("ERR_ARTIFACT_RESOLVE_FAILED");
        }
        artifactIdByProvenance.set(entry.artifactId, resolved);
      }

      const entityId = uuidFromKey(`demo-hvac-customer:${tenantId}:${row.id}`);
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO qum_entities (
          id, tenant_id, schema_version_id, entity_type, natural_key, status, canonical_data
        )
        VALUES (
          ${entityId}::uuid,
          ${tenantId}::uuid,
          ${schemaVersionId}::uuid,
          'customer',
          ${row.taxId ?? row.id},
          'MIGRATED',
          ${tx.json({ legalName: row.legalName, taxId: row.taxId ?? null })}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id::text
      `;
      if (inserted.length === 0) continue;

      for (const entry of row.provenance) {
        const artifactId = artifactIdByProvenance.get(entry.artifactId);
        if (!artifactId) continue;
        await tx`
          INSERT INTO qum_provenance_entries (
            id, tenant_id, entity_id, field_path, artifact_id, schema_version_id,
            origin_kind, transformation_id, rule_version, metadata_json
          )
          VALUES (
            ${uuidFromKey(`prov:${entityId}:${entry.sourceLocator}`)}::uuid,
            ${tenantId}::uuid,
            ${entityId}::uuid,
            'legal_name',
            ${artifactId}::uuid,
            ${schemaVersionId}::uuid,
            'DIRECT_PARSE',
            'demo-hvac-1000.load',
            '1.0.0',
            ${tx.json({ sourceLocator: entry.sourceLocator })}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }

      await tx`
        INSERT INTO ofi_customers (id, tenant_id, legal_name, tax_id, provenance_entity_id)
        VALUES (
          ${entityId}::uuid,
          ${tenantId}::uuid,
          ${row.legalName},
          ${row.taxId ?? null},
          ${entityId}::uuid
        )
        ON CONFLICT (id) DO NOTHING
      `;
      customers += 1;

      const equipmentId = uuidFromKey(`demo-hvac-equipment:${entityId}`);
      await tx`
        INSERT INTO ofi_equipment (
          id, tenant_id, customer_id, trade_contract_id, serial_number, provenance_entity_id
        )
        VALUES (
          ${equipmentId}::uuid,
          ${tenantId}::uuid,
          ${entityId}::uuid,
          ${HVAC_CONTRACT},
          ${row.taxId ? `EQ-${row.taxId}` : equipmentId.slice(0, 8)},
          ${entityId}::uuid
        )
        ON CONFLICT (id) DO NOTHING
      `;
      equipment += 1;
    }
  });

  return { customers, equipment };
}

export async function persistDemoHvacToOficiosFromEnv(
  tenantId: string,
): Promise<PersistDemoHvacResult> {
  const client = postgres(resolveDatabaseUrl(), { max: 1, onnotice() {} });
  try {
    return await persistDemoHvacToOficios(client, tenantId);
  } finally {
    await client.end({ timeout: 2 });
  }
}
