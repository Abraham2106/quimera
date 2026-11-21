import type { Sql } from "postgres";

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
          createdAt: string;
        }[];
      };
    };

export async function loadCustomerProvenance(
  sql: Sql,
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
      created_at: Date;
    }[]
  >`
    SELECT
      id,
      field_path,
      origin_kind,
      transformation_id,
      rule_version,
      artifact_id,
      created_at
    FROM qum_provenance_entries
    WHERE tenant_id = ${tenantId}::uuid
      AND entity_id = ${customer.provenance_entity_id}::uuid
    ORDER BY created_at ASC
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
        createdAt: e.created_at.toISOString(),
      })),
    },
  };
}