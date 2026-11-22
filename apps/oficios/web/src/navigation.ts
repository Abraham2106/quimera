export type AppSection = "ordenes" | "clientes" | "exodus" | "admin";

const NAV: { id: AppSection; label: string; adminOnly?: boolean }[] = [
  { id: "ordenes", label: "Órdenes" },
  { id: "clientes", label: "Clientes y equipos" },
  { id: "exodus", label: "Data Exodus", adminOnly: true },
  { id: "admin", label: "Administración", adminOnly: true },
];

export function visibleSections(role: string): AppSection[] {
  return NAV.filter(
    (item) =>
      !item.adminOnly ||
      role === "ADMIN" ||
      (item.id === "admin" && role === "AUDITOR_READONLY"),
  ).map((item) => item.id);
}

export function sectionLabel(section: AppSection): string {
  return NAV.find((item) => item.id === section)?.label ?? "Órdenes";
}
