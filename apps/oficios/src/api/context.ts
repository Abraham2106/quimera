import type { Sql } from "postgres";

export const OFICIOS_ROLES = ["ADMIN", "OPERATOR", "AUDITOR_READONLY"] as const;

export type OficiosRole = (typeof OFICIOS_ROLES)[number];

export function parseOficiosRole(raw: string | undefined): OficiosRole | null {
  if (!raw) {
    return null;
  }
  return OFICIOS_ROLES.includes(raw as OficiosRole) ? (raw as OficiosRole) : null;
}

export type OficiosRequestContext = {
  readonly tenantId: string;
  readonly role: OficiosRole;
  readonly actorId: string;
  readonly sql: Sql;
};