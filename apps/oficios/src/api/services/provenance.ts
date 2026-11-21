import type { OficiosSql } from "../../db/connection.js";

export type ProvenancePayload =
  | { provenance: null }
  | {
      provenance: {
        entityId: string;
        entries: readonly {
          id: string;
          fieldPath: string;
          originKind: string;
          transformationId: string;
          ruleVersion: string;
          artifactId: string;
          artifactName: string | null;
          sourceLocator: string | null;
          createdAt: string;
        }[];
      };
    };

export async function loadCustomerProvenance(
  sql: OficiosSql,
  tenantId: string,
  customerId: string,
): Promise<ProvenancePayload | "not_found"> {
  const customers = await sql<
    { id: string; provenance_entity_id: string | null }[]
  >`
    SELECT id, provenance_entity_id::text
    FROM ofi_customers
    WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid
  `;
  const customer = customers[0];
  if (!customer) {
    return "not_found";
  }

  if (!customer.provenance_entity_id) {
    return { provenance: null };
  }

  const entries = await sql<
    {
      id: string;
      field_path: string;
      origin_kind: string;
      transformation_id: string;
      rule_version: string;
      artifact_id: string;
      artifact_name: string | null;
      source_locator: string | null;
      created_at: Date;
    }[]
  >`
    SELECT
      e.id,
      e.field_path,
      e.origin_kind,
      e.transformation_id,
      e.rule_version,
      e.artifact_id,
      a.original_name AS artifact_name,
      COALESCE(r.source_locator, e.metadata_json->>'sourceLocator') AS source_locator,
      e.created_at
    FROM qum_provenance_entries e
    LEFT JOIN qum_artifacts a
      ON a.id = e.artifact_id AND a.tenant_id = e.tenant_id
    LEFT JOIN qum_raw_records r
      ON r.id = e.raw_record_id AND r.tenant_id = e.tenant_id
    WHERE e.tenant_id = ${tenantId}::uuid
      AND e.entity_id = ${customer.provenance_entity_id}::uuid
    ORDER BY e.created_at ASC
  `;

  return {
    provenance: {
      entityId: customer.provenance_entity_id,
      entries: entries.map((e) => ({
        id: e.id,
        fieldPath: e.field_path,
        originKind: e.origin_kind,
        transformationId: e.transformation_id,
        ruleVersion: e.rule_version,
        artifactId: e.artifact_id,
        artifactName: e.artifact_name,
        sourceLocator: e.source_locator,
        createdAt: e.created_at.toISOString(),
      })),
    },
  };
}