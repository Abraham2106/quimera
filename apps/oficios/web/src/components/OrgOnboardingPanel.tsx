import { useState } from "react";

import type { DevApiConfig } from "../config.js";
import { HVAC_TRADE_CONTRACT_ID, registerOrganization } from "../api/org-client.js";

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
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Alta de organización B2B</h2>
      <p className="mt-1 text-sm text-slate-600">
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
        <label className="flex flex-col">
          <span className="text-slate-600">Nombre comercial</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            value={commercialName}
            onChange={(e) => setCommercialName(e.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-slate-600">Razón social</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-slate-600">Cédula jurídica / física</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-slate-600">Slug</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="w-fit rounded bg-emerald-800 px-4 py-2 font-medium text-white disabled:opacity-50"
          disabled={busy}
        >
          Registrar organización
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-slate-800">{message}</p> : null}
      {tenantId ? (
        <p className="mt-1 text-xs text-slate-500">Tenant: {tenantId}</p>
      ) : null}
    </section>
  );
}