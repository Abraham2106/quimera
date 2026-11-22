import { conflictFingerprint } from "./fingerprint.js";
import type {
  BalanceDeclaration,
  DetectedConflict,
  NormalizedInvoice,
  NormalizedPayment,
} from "./types.js";

const ANULLED_STATUSES = new Set([
  "ANULADO",
  "ANULADA",
  "ANULLADO",
  "ANULLADA",
  "CANCELADO",
  "CANCELLED",
  "VOID",
]);

function isAnnulled(record: { annulled?: boolean; status?: string }): boolean {
  if (record.annulled === true) {
    return true;
  }
  const status = record.status?.trim().toUpperCase();
  return status !== undefined && ANULLED_STATUSES.has(status);
}

/**
 * Identidad de la contraparte: se prefiere el clientId canónico y, si no existe,
 * la cédula normalizada. Así facturas y pagos se agrupan con el saldo declarado.
 */
function partyKey(clientId?: string, clientTaxId?: string): string {
  if (clientId) {
    return clientId;
  }
  return (clientTaxId ?? "").replace(/\D/g, "");
}

function groupKey(party: string, invoiceNumber: string, currency: string): string {
  return `${party}\u0000${invoiceNumber.trim()}\u0000${currency}`;
}

function partyCurrencyKey(party: string, currency: string): string {
  return `${party}\u0000${currency}`;
}

function addTo(map: Map<string, bigint>, key: string, amount: bigint): void {
  if (!key) {
    return;
  }
  map.set(key, (map.get(key) ?? 0n) + amount);
}

type InvoiceGroup = {
  party: string;
  currency: string;
  invoiceTotal: bigint;
  paymentTotal: bigint;
};

/**
 * Detecta saldos irreconciliables con una sola pasada sobre facturas, pagos y
 * saldos: se preagregan Map por (taxId, invoiceNumber, currency) y se consultan
 * en O(1) por saldo. Los comprobantes anulados no entran en los totales.
 */
export function detectUnreconcilableBalances(
  invoices: NormalizedInvoice[],
  payments: NormalizedPayment[],
  balances: BalanceDeclaration[],
): DetectedConflict[] {
  const byInvoiceKey = new Map<string, InvoiceGroup>();

  const groupFor = (party: string, invoiceNumber: string, currency: string): InvoiceGroup => {
    const key = groupKey(party, invoiceNumber, currency);
    let group = byInvoiceKey.get(key);
    if (!group) {
      group = { party, currency, invoiceTotal: 0n, paymentTotal: 0n };
      byInvoiceKey.set(key, group);
    }
    return group;
  };

  for (const inv of invoices) {
    if (isAnnulled(inv)) {
      continue;
    }
    const party = partyKey(inv.clientId, inv.clientTaxId);
    groupFor(party, inv.invoiceNumber ?? "", inv.currency).invoiceTotal += inv.amountMinor;
  }

  const paymentsWithoutInvoice = new Map<string, bigint>();
  for (const pay of payments) {
    if (isAnnulled(pay)) {
      continue;
    }
    const party = partyKey(pay.clientId, pay.clientTaxId);
    const invoiceNumber = pay.invoiceNumber?.trim() ?? "";
    if (invoiceNumber.length > 0) {
      groupFor(party, invoiceNumber, pay.currency).paymentTotal += pay.amountMinor;
    } else {
      addTo(paymentsWithoutInvoice, partyCurrencyKey(party, pay.currency), pay.amountMinor);
    }
  }

  const invoiceTotalsByParty = new Map<string, bigint>();
  const paymentTotalsByParty = new Map<string, bigint>();
  for (const group of byInvoiceKey.values()) {
    const key = partyCurrencyKey(group.party, group.currency);
    addTo(invoiceTotalsByParty, key, group.invoiceTotal);
    addTo(paymentTotalsByParty, key, group.paymentTotal);
  }
  for (const [key, amount] of paymentsWithoutInvoice) {
    addTo(paymentTotalsByParty, key, amount);
  }

  const conflicts: DetectedConflict[] = [];
  for (const bal of balances) {
    // Un saldo puede traer clientId, cédula o ambos; se usa el primer alias
    // con totales conocidos para no perder la agregación por IDENTIDAD.
    const candidateParties = [bal.clientId, (bal.clientTaxId ?? "").replace(/\D/g, "")].filter(
      (value): value is string => Boolean(value),
    );
    let invTotal = 0n;
    let payTotal = 0n;
    let matched = false;
    for (const party of candidateParties) {
      const key = partyCurrencyKey(party, bal.currency);
      if (invoiceTotalsByParty.has(key) || paymentTotalsByParty.has(key)) {
        invTotal = invoiceTotalsByParty.get(key) ?? 0n;
        payTotal = paymentTotalsByParty.get(key) ?? 0n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const key = partyCurrencyKey(partyKey(bal.clientId, bal.clientTaxId), bal.currency);
      invTotal = invoiceTotalsByParty.get(key) ?? 0n;
      payTotal = paymentTotalsByParty.get(key) ?? 0n;
    }

    const computed = invTotal - payTotal;
    if (computed !== bal.declaredBalanceMinor) {
      conflicts.push({
        conflictCode: "UNRECONCILABLE_BALANCE",
        severity: "BLOCKING",
        autoResolved: false,
        candidateRecordIds: [bal.id],
        summary: `Cliente ${bal.clientId}: saldo declarado ${bal.declaredBalanceMinor} ≠ facturas(${invTotal}) - pagos(${payTotal}).`,
        fingerprint: conflictFingerprint("UNRECONCILABLE_BALANCE", [bal.id]),
      });
    }
  }

  return conflicts;
}
