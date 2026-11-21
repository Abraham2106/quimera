const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibida",
  DIAGNOSED: "Diagnosticada",
  QUOTED: "Presupuestada",
  APPROVED: "Aprobada por el cliente",
  IN_PROGRESS: "En intervención",
  VERIFIED: "Verificada",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "En proceso";
}