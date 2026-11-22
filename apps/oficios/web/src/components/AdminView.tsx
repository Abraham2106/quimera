import { useEffect, useState } from "react";

import type { DevApiConfig } from "../config.js";
import { appendDevAuthHeaders } from "../dev-auth-headers.js";
import { OrgOnboardingPanel } from "./OrgOnboardingPanel.js";
import { TeamManagementPanel } from "./TeamManagementPanel.js";

type Billing = {
  planCode: string;
  status: string;
  usage: { seats: number };
  limits: { maxSeats: number };
} | null;

type AuditEvent = {
  id: string;
  actorId: string;
  action: string;
  resource: string;
  createdAt: string;
};

function headers(config: DevApiConfig, json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (config.accessToken.trim()) h.authorization = `Bearer ${config.accessToken.trim()}`;
  appendDevAuthHeaders(config, h);
  if (json) h["content-type"] = "application/json";
  return h;
}

export function AdminView(props: { readonly config: DevApiConfig; readonly readOnly: boolean }) {
  const [tab, setTab] = useState<"org" | "fiscal" | "plan" | "audit">(
    props.config.testRole === "AUDITOR_READONLY" ? "audit" : "org",
  );

  const tabs: readonly { readonly id: "org" | "fiscal" | "plan" | "audit"; readonly label: string }[] = [
    ...(props.config.testRole !== "AUDITOR_READONLY"
      ? ([
          { id: "org", label: "Organización y equipo" },
          { id: "fiscal", label: "Configuración fiscal" },
        ] as const)
      : []),
    { id: "plan", label: "Plan y consumo" },
    { id: "audit", label: "Auditoría" },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)]">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`touch relative px-4 text-sm ${
                active ? "font-semibold text-[var(--accent)]" : "font-medium text-[var(--ink-muted)]"
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" /> : null}
            </button>
          );
        })}
      </div>

      {tab === "org" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <OrgOnboardingPanel config={props.config} />
          <TeamManagementPanel config={props.config} />
        </div>
      ) : null}
      {tab === "fiscal" ? <FiscalPanel config={props.config} readOnly={props.readOnly} /> : null}
      {tab === "plan" ? <PlanPanel config={props.config} /> : null}
      {tab === "audit" ? <AuditPanel config={props.config} /> : null}
    </section>
  );
}

function PlanPanel(props: { readonly config: DevApiConfig }) {
  const [billing, setBilling] = useState<Billing>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);

  async function load() {
    const response = await fetch(`${props.config.apiBase}/api/v1/billing/usage`, { headers: headers(props.config) });
    const json = (await response.json()) as { billing?: Billing; error?: { message?: string; code?: string } };
    if (response.status === 402 || json.error?.code === "ERR_QUOTA_EXCEEDED") {
      setWarn(true);
      setBilling(null);
      setSummary(json.error?.message ?? "El plan alcanzó un límite. Los comprobantes ya encolados siguen su curso.");
      return;
    }
    if (!response.ok || !json.billing) {
      setBilling(null);
      setSummary(json.error?.message ?? "Sin suscripción.");
      return;
    }
    setBilling(json.billing);
    const ratio = json.billing.limits.maxSeats === 0 ? 0 : json.billing.usage.seats / json.billing.limits.maxSeats;
    setWarn(ratio >= 0.8);
    setSummary(
      `${json.billing.planCode} (${json.billing.status}): ${json.billing.usage.seats}/${json.billing.limits.maxSeats} asientos`,
    );
  }

  useEffect(() => {
    void load();
  }, [props.config]);

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)]">Plan y consumo</h2>
        </div>
        <button type="button" className="touch btn-secondary text-xs" onClick={() => void load()}>
          Actualizar
        </button>
      </div>

      {summary ? <p className="num mt-4 text-sm font-medium text-[var(--ink)]">{summary}</p> : null}


      {warn ? (
        <p
          className="banner-warn mt-4 px-4 py-3 text-sm"
          role="status"
        >
          El consumo se acerca o alcanzó el límite. Los comprobantes fiscales ya encolados no se interrumpen.
        </p>
      ) : null}
    </section>
  );
}

function AuditPanel(props: { readonly config: DevApiConfig }) {
  const [events, setEvents] = useState<readonly AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${props.config.apiBase}/api/v1/audit`, { headers: headers(props.config) }).then(async (response) => {
      const json = (await response.json()) as { events?: AuditEvent[]; error?: { message?: string } };
      if (!response.ok) {
        setError(json.error?.message ?? "No se pudo leer la bitácora.");
        return;
      }
      setEvents(json.events ?? []);
    });
  }, [props.config]);

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]/70 px-5 py-4">
        <h2 className="text-base font-semibold text-[var(--ink)]">Auditoría</h2>
      </div>
      {error ? <p className="p-5 text-sm text-[var(--status-warn-ink)]">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border-subtle)] text-xs font-medium text-[var(--ink-muted)]">
            <tr>
              <th className="px-5 py-3 font-semibold">Fecha</th>
              <th className="px-5 py-3 font-semibold">Actor</th>
              <th className="px-5 py-3 font-semibold">Acción</th>
              <th className="px-5 py-3 font-semibold">Recurso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-[var(--ink-muted)]">
                  Sin eventos registrados todavía.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="hover:bg-[var(--surface-subtle)]/50">
                  <td className="num px-5 py-3 whitespace-nowrap text-xs text-[var(--ink-muted)]">
                    {new Date(event.createdAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" })}
                  </td>
                  <td className="num max-w-[14rem] truncate px-5 py-3 text-xs font-medium text-[var(--ink)]" title={event.actorId}>{event.actorId}</td>
                  <td className="px-5 py-3">
                    <span className="num rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--ink)]">
                      {event.action}
                    </span>
                  </td>
                  <td className="num max-w-[18rem] truncate px-5 py-3 text-xs text-[var(--ink-muted)]" title={event.resource}>{event.resource}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FiscalPanel(props: { readonly config: DevApiConfig; readonly readOnly: boolean }) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [certificateName, setCertificateName] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${props.config.apiBase}/api/v1/fiscal/credentials`, { headers: headers(props.config) }).then(
      async (response) => {
        const json = (await response.json()) as { fingerprint?: string | null; environment?: string; note?: string };
        if (json.fingerprint) setFingerprint(json.fingerprint);
        if (json.note) setMessage(`${json.environment ?? "sandbox"}. ${json.note}`);
      },
    );
  }, [props.config]);

  return (
    <section className="card p-5 text-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)]">Configuración fiscal (Hacienda)</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            La verificación en este entorno es local y no constituye aceptación del Ministerio de Hacienda.
          </p>
        </div>
        <span className="text-xs text-[var(--ink-muted)]">sandbox</span>
      </div>

      {fingerprint ? (
        <p className="banner-done num mt-4 px-4 py-2.5 text-xs font-semibold">
          Huella {fingerprint} · sandbox
        </p>
      ) : null}

      <form
        className="mt-4 grid max-w-lg gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("file");
          const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
          if (!file) return;
          const body = new FormData();
          body.set("file", file);
          body.set("pin", pin);
          void fetch(`${props.config.apiBase}/api/v1/fiscal/credentials`, {
            method: "POST",
            headers: headers(props.config),
            body,
          }).then(async (response) => {
            const json = (await response.json()) as { fingerprint?: string; error?: { message?: string } };
            setPin("");
            setCertificateName(null);
            if (input instanceof HTMLInputElement) input.value = "";
            if (!response.ok) {
              setMessage(json.error?.message ?? "No se pudo guardar el certificado.");
              return;
            }
            setFingerprint(json.fingerprint ?? null);
            setMessage("Certificado recibido en sandbox. No se muestra el PIN ni el archivo.");
          });
        }}
      >
        <div className="text-xs font-medium text-[var(--ink)]">
          <p>Llave criptográfica (.p12)</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <label className="touch btn-secondary cursor-pointer">
              Elegir certificado
              <input
                name="file"
                type="file"
                accept=".p12,application/x-pkcs12"
                disabled={props.readOnly}
                className="sr-only"
                onChange={(event) => setCertificateName(event.target.files?.[0]?.name ?? null)}
              />
            </label>
            <span className="text-sm font-normal text-[var(--ink-muted)]">
              {certificateName ?? "Ningún archivo elegido"}
            </span>
          </div>
        </div>
        <label className="text-xs font-medium text-[var(--ink)]">
          PIN del certificado
          <input
            type="password"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="PIN"
            className="field mt-1"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={props.readOnly}
          />
        </label>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button type="submit" className="touch btn-primary" disabled={props.readOnly}>
            Cargar certificado
          </button>
          <button
            type="button"
            className="touch btn-secondary"
            disabled={props.readOnly}
            onClick={() => {
              void fetch(`${props.config.apiBase}/api/v1/fiscal/credentials/promote`, {
                method: "POST",
                headers: headers(props.config, true),
                body: JSON.stringify({ adminConfirmed: true }),
              }).then(async (response) => {
                const json = (await response.json()) as { error?: { message?: string }; environment?: string };
                setMessage(json.error?.message ?? `Entorno ${json.environment ?? "production"}`);
              });
            }}
          >
            Promover a producción
          </button>
        </div>
      </form>

      {message ? (
        <p
          className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-2.5 text-sm text-[var(--ink)]"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
