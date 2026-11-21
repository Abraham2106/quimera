import { sql } from "drizzle-orm";
import type { QuimeraDb } from "../db/connection.js";

const MINIMAL_OFI_DDL = `
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
`;

export async function ofiCustomersTableExists(db: QuimeraDb): Promise<boolean> {
  const rows = await db.execute<{ reg: string | null }>(
    sql`SELECT to_regclass('public.ofi_customers')::text AS reg`,
  );
  const first = rows[0] as { reg?: string | null } | undefined;
  return first?.reg != null;
}

export async function ensureMinimalOfiTables(db: QuimeraDb): Promise<void> {
  await db.execute(sql.raw(MINIMAL_OFI_DDL));
}