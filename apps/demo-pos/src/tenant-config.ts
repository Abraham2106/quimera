const TENANT_EMISOR: Record<string, string> = {
  "tenant-a": "3101111111",
  "tenant-b": "3101222222",
  default: "3101999999",
};

/** Slug de escenario Factura CI → UUID en `qum_tenants`. */
export const TENANT_SLUG_TO_UUID: Record<string, string> = {
  "tenant-a": "11111111-1111-7111-8111-111111111111",
  "tenant-b": "22222222-2222-7222-8222-222222222222",
};

export function emisorForTenant(tenantId: string): string {
  const key = tenantId.toLowerCase();
  return TENANT_EMISOR[key] ?? TENANT_EMISOR.default ?? "3101999999";
}

export function tenantUuidForSlug(tenantSlug: string): string {
  return TENANT_SLUG_TO_UUID[tenantSlug] ?? tenantSlug;
}