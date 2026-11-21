import {
  reconcileDetect,
  type NormalizedClient,
  type NormalizedInvoice,
  type NormalizedPayment,
  type ProvenanceEntry,
  type ReconcileDataset,
} from "../../src/reconcile/index.js";

export const DEMO_ARTIFACT_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_SCHEMA_VERSION_ID = "33333333-3333-4333-8333-333333333333";
export const DEMO_BATCH_ID = "44444444-4444-4444-8444-444444444444";
export const DEMO_SHA256 = "a".repeat(64);

const prov = (loc: string): ProvenanceEntry[] => [
  { artifactId: DEMO_ARTIFACT_ID, sourceLocator: loc },
];

export function buildDemoHvacMiniDataset(): ReconcileDataset {
  const clients: NormalizedClient[] = [];
  const invoices: NormalizedInvoice[] = [];
  const payments: NormalizedPayment[] = [];

  for (let g = 0; g < 40; g += 1) {
    const uniqueStem = `Marca Única-${g}`;
    const idA = `client-pd-${g}a`;
    const idB = `client-pd-${g}b`;
    clients.push({
      id: idA,
      legalName: `${uniqueStem} Refrigeración`,
      provenance: prov(`clientes.xlsx#${g}a`),
    });
    clients.push({
      id: idB,
      legalName: `${uniqueStem} Refrigeración S.A.`,
      provenance: prov(`ventas.csv#${g}b`),
    });
  }

  for (let c = 0; c < 3; c += 1) {
    const shared = `Empresa Conflictiva ${c}`;
    clients.push({
      id: `client-ci-${c}-1`,
      legalName: shared,
      taxId: `3-100-${c}001`,
      provenance: prov(`conflict-${c}-1`),
    });
    clients.push({
      id: `client-ci-${c}-2`,
      legalName: `${shared} Ltda.`,
      taxId: `3-200-${c}002`,
      provenance: prov(`conflict-${c}-2`),
    });
  }

  for (let d = 0; d < 12; d += 1) {
    const hash = `a${d.toString().padStart(63, "0")}`;
    const fiscal = "5".repeat(50);
    const num = `FE-2025-${1000 + d}`;
    invoices.push({
      id: `inv-dup-${d}-1`,
      invoiceNumber: num,
      amountMinor: 120_000_00n,
      currency: "CRC",
      recordHash: hash,
      fiscalKey50: fiscal,
      provenance: prov(`xml/${num}-a.xml`),
    });
    invoices.push({
      id: `inv-dup-${d}-2`,
      invoiceNumber: num,
      amountMinor: 120_000_00n,
      currency: "CRC",
      recordHash: hash,
      fiscalKey50: fiscal,
      provenance: prov(`ventas.csv#${num}`),
    });
  }

  const anchorClient = "client-anchor";
  const anchorTax = "3-0101-0101";
  clients.push({
    id: anchorClient,
    legalName: "Cliente Ancla",
    taxId: anchorTax,
    provenance: prov("anchor"),
  });

  const goodInv = "inv-good-1";
  invoices.push({
    id: goodInv,
    invoiceNumber: "FE-9000",
    amountMinor: 50_000_00n,
    currency: "CRC",
    clientId: anchorClient,
    clientTaxId: anchorTax,
    provenance: prov("good-invoice"),
  });

  for (let p = 0; p < 3; p += 1) {
    payments.push({
      id: `pay-orphan-${p}`,
      amountMinor: 1_000_00n,
      currency: "CRC",
      invoiceNumber: `MISSING-INV-${p}`,
      provenance: prov(`pagos.csv#orphan-${p}`),
    });
  }

  for (let p = 0; p < 4; p += 1) {
    const num = `FE-900${p}`;
    invoices.push({
      id: `inv-ref-${p}`,
      invoiceNumber: num,
      amountMinor: 10_000_00n,
      currency: "CRC",
      clientTaxId: anchorTax,
      provenance: prov(`inv-ref-${p}`),
    });
    payments.push({
      id: `pay-invalid-${p}`,
      amountMinor: 10_000_00n,
      currency: "CRC",
      invoiceNumber: num,
      clientTaxId: "9-9999-9999",
      provenance: prov(`pagos.csv#invalid-${p}`),
    });
  }

  payments.push({
    id: "pay-good",
    amountMinor: 5_000_00n,
    currency: "CRC",
    invoiceNumber: "FE-9000",
    clientId: anchorClient,
    clientTaxId: anchorTax,
    provenance: prov("pay-good"),
  });

  const balances = [
    {
      id: "bal-bad",
      clientId: anchorClient,
      declaredBalanceMinor: 99_000_00n,
      currency: "CRC",
      provenance: prov("saldos.xlsx#1"),
    },
  ];

  return { clients, invoices, payments, balances };
}

export function demoReconcileCounts() {
  return reconcileDetect(buildDemoHvacMiniDataset());
}