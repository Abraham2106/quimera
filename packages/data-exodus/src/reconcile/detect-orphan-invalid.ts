import { conflictFingerprint } from "./fingerprint.js";
import type {
  DetectedConflict,
  NormalizedClient,
  NormalizedInvoice,
  NormalizedPayment,
} from "./types.js";

export function detectOrphanAndInvalidReferences(
  clients: NormalizedClient[],
  invoices: NormalizedInvoice[],
  payments: NormalizedPayment[],
): DetectedConflict[] {
  const clientIds = new Set(clients.map((c) => c.id));
  const clientTaxIds = new Map<string, string>();
  for (const c of clients) {
    if (c.taxId) {
      clientTaxIds.set(c.taxId.replace(/\D/g, ""), c.id);
    }
  }

  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const invoiceByNumber = new Map<string, NormalizedInvoice[]>();
  for (const inv of invoices) {
    const key = inv.invoiceNumber.trim();
    if (!key) {
      continue;
    }
    const list = invoiceByNumber.get(key) ?? [];
    list.push(inv);
    invoiceByNumber.set(key, list);
  }

  const conflicts: DetectedConflict[] = [];

  for (const pay of payments) {
    const refs: string[] = [pay.id];
    let orphan = false;
    let invalid = false;
    let summary = "";

    if (pay.invoiceId && !invoiceById.has(pay.invoiceId)) {
      orphan = true;
      summary = `Pago ${pay.id} referencia factura inexistente por id.`;
    }

    if (pay.invoiceNumber) {
      const matches = invoiceByNumber.get(pay.invoiceNumber.trim());
      if (!matches || matches.length === 0) {
        orphan = true;
        summary = `Pago ${pay.id} referencia factura ${pay.invoiceNumber} inexistente.`;
      } else if (pay.clientTaxId) {
        const normPayTax = pay.clientTaxId.replace(/\D/g, "");
        const invoiceTaxIds = new Set(
          matches
            .map((m) => m.clientTaxId?.replace(/\D/g, ""))
            .filter((t): t is string => Boolean(t)),
        );
        if (invoiceTaxIds.size > 0 && !invoiceTaxIds.has(normPayTax)) {
          invalid = true;
          summary = `Pago ${pay.id} atribuido a cédula distinta a la de la factura ${pay.invoiceNumber}.`;
        }
      }
    }

    if (pay.clientId && !clientIds.has(pay.clientId)) {
      orphan = true;
      summary = `Pago ${pay.id} referencia cliente inexistente.`;
    }

    if (orphan) {
      conflicts.push({
        conflictCode: "ORPHAN_RECORD",
        severity: "BLOCKING",
        autoResolved: false,
        candidateRecordIds: refs,
        summary,
        fingerprint: conflictFingerprint("ORPHAN_RECORD", refs),
      });
    } else if (invalid) {
      conflicts.push({
        conflictCode: "INVALID_REFERENCE",
        severity: "BLOCKING",
        autoResolved: false,
        candidateRecordIds: refs,
        summary,
        fingerprint: conflictFingerprint("INVALID_REFERENCE", refs),
      });
    }
  }

  return conflicts;
}