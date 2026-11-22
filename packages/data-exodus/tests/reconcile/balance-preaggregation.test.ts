import { describe, expect, it } from "vitest";

import { detectUnreconcilableBalances } from "../../src/reconcile/detect-unreconcilable-balance.js";
import type {
  BalanceDeclaration,
  NormalizedInvoice,
  NormalizedPayment,
} from "../../src/reconcile/types.js";

const prov = () => [];

describe("detectUnreconcilableBalances — preagregación", () => {
  it("excluye comprobantes anulados del saldo", () => {
    const invoices: NormalizedInvoice[] = [
      {
        id: "inv-1",
        invoiceNumber: "F-1",
        amountMinor: 10_000n,
        currency: "CRC",
        clientId: "c-1",
        provenance: prov(),
      },
      {
        id: "inv-void",
        invoiceNumber: "F-2",
        amountMinor: 99_000n,
        currency: "CRC",
        clientId: "c-1",
        annulled: true,
        provenance: prov(),
      },
    ];
    const payments: NormalizedPayment[] = [];
    const balances: BalanceDeclaration[] = [
      {
        id: "bal-1",
        clientId: "c-1",
        declaredBalanceMinor: 10_000n,
        currency: "CRC",
        provenance: prov(),
      },
    ];

    expect(detectUnreconcilableBalances(invoices, payments, balances)).toEqual([]);
  });

  it("agrupa por (taxId, invoiceNumber, currency) sin confundir clients", () => {
    const invoices: NormalizedInvoice[] = [
      {
        id: "inv-a",
        invoiceNumber: "F-1",
        amountMinor: 5_000n,
        currency: "CRC",
        clientTaxId: "1-1111-1111",
        provenance: prov(),
      },
      {
        id: "inv-b",
        invoiceNumber: "F-1",
        amountMinor: 7_000n,
        currency: "USD",
        clientTaxId: "1-1111-1111",
        provenance: prov(),
      },
      {
        id: "inv-c",
        invoiceNumber: "F-1",
        amountMinor: 3_000n,
        currency: "CRC",
        clientTaxId: "2-2222-2222",
        provenance: prov(),
      },
    ];
    const balances: BalanceDeclaration[] = [
      {
        id: "bal-a",
        clientTaxId: "1-1111-1111",
        clientId: "client-a",
        declaredBalanceMinor: 5_000n,
        currency: "CRC",
        provenance: prov(),
      },
    ];

    const conflicts = detectUnreconcilableBalances(invoices, [], balances);
    expect(conflicts).toEqual([]);
  });
});
