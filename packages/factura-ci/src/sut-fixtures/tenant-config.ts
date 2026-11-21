const TENANT_EMISOR: Record<string, string> = {
  "tenant-a": "3101111111",
  "tenant-b": "3101222222",
  default: "3101999999",
};

export function emisorForTenant(tenantId: string): string {
  const key = tenantId.toLowerCase();
  const mapped = TENANT_EMISOR[key];
  return mapped ?? "3101999999";
}