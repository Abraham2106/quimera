import { randomUUID } from "node:crypto";

import type { OficiosSql } from "../../db/connection.js";

export function redactAuditText(value: string): string {
  return value
    .replace(/postgres:\/\/[^@\s]+@/gi, "postgres://[redacted]@")
    .replace(/(pin|password|secret|token|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

export async function writeAuditLog(
  sql: OficiosSql,
  input: { tenantId: string; actorId: string; action: string; resource: string },
): Promise<void> {
  await sql`
    INSERT INTO saas_audit_logs (id, tenant_id, actor_id, action, resource)
    VALUES (
      ${randomUUID()}::uuid,
      ${input.tenantId}::uuid,
      ${redactAuditText(input.actorId)},
      ${redactAuditText(input.action)},
      ${redactAuditText(input.resource)}
    )
  `;
}

export async function listAuditLogs(sql: OficiosSql, tenantId: string) {
  return sql<{ id: string; actor_id: string; action: string; resource: string; created_at: Date }[]>`
    SELECT id::text, actor_id, action, resource, created_at
    FROM saas_audit_logs
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at ASC
  `;
}
