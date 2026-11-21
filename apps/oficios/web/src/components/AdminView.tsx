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
  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-2">
        {props.config.testRole !== "AUDITOR_READONLY" ? (
          <>
            <button type="button" className="touch rounded border bg-white px-3 text-sm" onClick={() => setTab("org")}>Organización y equipo</button>
            <button type="button" className="touch rounded border bg-white px-3 text-sm" onClick={() => setTab("fiscal")}>Configuración fiscal</button>
          </>
        ) : null}
        <button type="button" className="touch rounded border bg-white px-3 text-sm" onClick={() => setTab("plan")}>Plan y consumo</button>
        <button type="button" className="touch rounded border bg-white px-3 text-sm" onClick={() => setTab("audit")}>Auditoría</button>
      </div>
      {tab === "org" ? (
        <>
          <OrgOnboardingPanel config={props.config} />
          <TeamManagementPanel config={props.config} />
        </>
      ) : null}
      {tab === "fiscal" ? <FiscalPanel config={props.config} readOnly={props.readOnly} /> : null}
      {tab === "plan" ? <PlanPanel config={props.config} /> : null}
      {tab === "audit" ? <AuditPanel config={props.config} /> : null}
    </section>
  );
}

function PlanPanel(props: { readonly config: DevApiConfig }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);

  async function load() {
    const response = await fetch(`${props.config.apiBase}/api/v1/billing/usage`, { headers: headers(props.config) });
    const json = (await response.json()) as { billing?: Billing; error?: { message?: string; code?: string } };
    if (response.status === 402 || json.error?.code === "ERR_QUOTA_EXCEEDED") {
      setWarn(true);
      setSummary(json.error?.message ?? "El plan alcanzó un límite. Los comprobantes ya encolados siguen su curso.");
      return;
    }
    if (!response.ok || !json.billing) {
      setSummary(json.error?.message ?? "Sin suscripción.");
      return;
    }
    const ratio = json.billing.limits.maxSeats === 0 ? 0 : json.billing.usage.seats / json.billing.limits.maxSeats;
    setWarn(ratio >= 0.8);
    setSummary(`${json.billing.planCode} (${json.billing.status}): ${json.billing.usage.seats}/${json.billing.limits.maxSeats} asientos`);
  }

  useEffect(() => {
    void load();
  }, [props.config]);

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="text-base font-semibold">Plan y consumo</h2>
      <button type="button" className="touch mt-2 rounded border px-3 text-sm" onClick={() => void load()}>Actualizar</button>
      {summary ? <p className="mt-2 text-sm">{summary}</p> : null}
      {warn ? <p className="mt-2 text-sm text-amber-800" role="status">El consumo se acerca o alcanzó el límite. Los comprobantes fiscales ya encolados no se interrumpen.</p> : null}
    </section>
  );
}

function AuditPanel(props: { readonly config: DevApiConfig }) {
  const [events, setEvents] = useState<readonly AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch(`${props.config.apiBase}/api/v1/audit`, { headers: headers(props.config) })
      .then(async (response) => {
        const json = (await response.json()) as { events?: AuditEvent[]; error?: { message?: string } };
        if (!response.ok) {
          setError(json.error?.message ?? "No se pudo leer la bitácora.");
          return;
        }
        setEvents(json.events ?? []);
      });
  }, [props.config]);
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="text-base font-semibold">Auditoría</h2>
      {error ? <p className="text-sm text-amber-800">{error}</p> : null}
      <table className="mt-2 w-full text-left text-sm">
        <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Recurso</th></tr></thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{new Date(event.createdAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" })}</td>
              <td>{event.actorId}</td>
              <td>{event.action}</td>
              <td>{event.resource}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FiscalPanel(props: { readonly config: DevApiConfig; readonly readOnly: boolean }) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${props.config.apiBase}/api/v1/fiscal/credentials`, { headers: headers(props.config) })
      .then(async (response) => {
        const json = (await response.json()) as { fingerprint?: string | null; environment?: string; note?: string };
        if (json.fingerprint) setFingerprint(json.fingerprint);
        if (json.note) setMessage(`${json.environment ?? "sandbox"}. ${json.note}`);
      });
  }, [props.config]);

  return (
    <section className="rounded border bg-white p-4 text-sm">
      <h2 className="text-base font-semibold">Configuración fiscal (Hacienda)</h2>
      <p className="mt-1 text-[var(--ink-muted)]">La verificación en este entorno es local y no constituye aceptación del Ministerio de Hacienda.</p>
      {fingerprint ? <p className="num mt-2">Huella {fingerprint} · sandbox</p> : null}
      <form
        className="mt-3 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("file");
          const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
          if (!file) return;
          const body = new FormData();
          body.set("file", file);
          body.set("pin", pin);
          void fetch(`${props.config.apiBase}/api/v1/fiscal/credentials`, { method: "POST", headers: headers(props.config), body })
            .then(async (response) => {
              const json = (await response.json()) as { fingerprint?: string; error?: { message?: string } };
              setPin("");
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
        <input name="file" type="file" accept=".p12,application/x-pkcs12" disabled={props.readOnly} />
        <input type="password" autoComplete="off" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} disabled={props.readOnly} />
        <button type="submit" className="touch w-fit rounded bg-[var(--accent)] px-3 text-white" disabled={props.readOnly}>Cargar certificado</button>
      </form>
      <button
        type="button"
        className="touch mt-3 rounded border px-3"
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
      {message ? <p className="mt-2" role="status">{message}</p> : null}
    </section>
  );
}
