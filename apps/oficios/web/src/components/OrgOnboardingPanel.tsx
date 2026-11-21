import { useState } from "react";

import { HVAC_TRADE_CONTRACT_ID, registerOrganization } from "../api/org-client.js";
import type { DevApiConfig } from "../config.js";

type Props = {
  readonly config: DevApiConfig;
};

export function OrgOnboardingPanel(props: Props) {
  const [commercialName, setCommercialName] = useState("Taller Refrigeración Pura Vida");
  const [legalName, setLegalName] = useState("Refrigeración Pura Vida S.A.");
  const [taxId, setTaxId] = useState("3-101-555443");
  const [slug, setSlug] = useState("taller-pura-vida");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-[var(--ink)]">Alta de organización B2B</h2>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        Registro transaccional con cédula CR normalizada y rol ADMIN inicial.
      </p>
      <form
        className="mt-4 grid gap-3 text-sm sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            setBusy(true);
            setMessage(null);
            try {
              const org = await registerOrganization(props.config, {
                commercialName,
                legalName,
                taxIdentification: taxId,
                economicActivity: "452011",
                tradeContractId: HVAC_TRADE_CONTRACT_ID,
                slug,
              });
              setTenantId(org.tenantId);
              setMessage(`Organización creada: ${org.tenantId}`);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "No se pudo registrar la organización.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="flex flex-col text-xs font-medium text-[var(--ink)]">
          Nombre comercial
          <input
            className="field mt-1"
            value={commercialName}
            onChange={(e) => setCommercialName(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-[var(--ink)]">
          Razón social
          <input
            className="field mt-1"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-[var(--ink)]">
          Cédula jurídica / física
          <input
            className="field num mt-1"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-[var(--ink)]">
          Slug
          <input
            className="field num mt-1"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        <div className="sm:col-span-2 pt-1">
          <button type="submit" className="touch btn-primary" disabled={busy}>
            Registrar organización
          </button>
        </div>
      </form>
      {message ? (
        <p className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3.5 py-2 text-sm text-[var(--ink)]">
          {message}
        </p>
      ) : null}
      {tenantId ? <p className="num mt-1.5 text-xs text-[var(--ink-muted)]">Tenant: {tenantId}</p> : null}
    </section>
  );
}
