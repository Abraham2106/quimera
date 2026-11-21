import { conflictFingerprint } from "./fingerprint.js";
import type {
  BalanceDeclaration,
  DetectedConflict,
  NormalizedInvoice,
  NormalizedPayment,
} from "./types.js";

export function detectUnreconcilableBalances(
  invoices: NormalizedInvoice[],
  payments: NormalizedPayment[],
  balances: BalanceDeclaration[],
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  for (const bal of balances) {
    const invTotal = invoices
      .filter((i) => i.clientId === bal.clientId && i.currency === bal.currency)
      .reduce((acc, i) => acc + i.amountMinor, 0n);

    const payTotal = payments
      .filter((p) => p.clientId === bal.clientId && p.currency === bal.currency)
      .reduce((acc, p) => acc + p.amountMinor, 0n);

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