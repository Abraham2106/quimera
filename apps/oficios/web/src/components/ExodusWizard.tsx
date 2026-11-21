import { useState } from "react";

import type { DevApiConfig } from "../config.js";
import { appendDevAuthHeaders } from "../dev-auth-headers.js";

type NeedsReview = { column: string; status: string; confidence: number };
type ConflictRow = { id: string; status: string; summary: string };

async function send(config: DevApiConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (config.accessToken.trim()) headers.set("authorization", `Bearer ${config.accessToken.trim()}`);
  const raw: Record<string, string> = {};
  headers.forEach((value, key) => {
    raw[key] = value;
  });
  appendDevAuthHeaders(config, raw);
  return fetch(`${config.apiBase}${path}`, { ...init, headers: raw });
}

const STEPS = ["Subir", "Perfilar", "Resolver conflictos", "Reanudar"] as const;

export function ExodusWizard(props: { readonly config: DevApiConfig }) {
  const [step, setStep] = useState(0);
  const [runId, setRunId] = useState("");
  const [needsReview, setNeedsReview] = useState<NeedsReview[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section>
      <h2 className="text-base font-semibold">Data Exodus</h2>
      <p className="mb-3 text-sm text-[var(--ink-muted)]">Cargue el archivo, revise NEEDS_REVIEW, resuelva conflictos y reanude la carga sin usar la CLI.</p>
      <ol className="mb-4 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => (
          <li key={label} className={`rounded px-2 py-2 ${index === step ? "bg-sky-50 text-[var(--accent)]" : "bg-white"}`}>{index + 1}. {label}</li>
        ))}
      </ol>
      {step === 0 ? (
        <form
          className="rounded border border-dashed border-[var(--border-subtle)] bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("file");
            const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
            if (!file) return;
            void (async () => {
              const body = new FormData();
              body.set("file", file);
              const response = await send(props.config, "/api/v1/migrations/uploads", { method: "POST", body });
              const json = (await response.json()) as { runId?: string; error?: { message?: string } };
              if (!response.ok || !json.runId) {
                setMessage(json.error?.message ?? "No se pudo subir el archivo.");
                return;
              }
              setRunId(json.runId);
              setMessage(`Archivo recibido. Corrida ${json.runId}.`);
              setStep(1);
            })();
          }}
        >
          <input name="file" type="file" accept=".csv,.xlsx,.xml,text/csv" />
          <button type="submit" className="touch mt-3 rounded bg-[var(--accent)] px-3 text-sm text-white">Subir</button>
        </form>
      ) : null}
      {step === 1 ? (
        <button
          type="button"
          className="touch rounded border bg-white px-3 text-sm"
          onClick={() => {
            void (async () => {
              const response = await send(props.config, `/api/v1/migrations/${runId}/profile`, { method: "POST" });
              const json = (await response.json()) as { needsReview?: NeedsReview[]; error?: { message?: string } };
              if (!response.ok) {
                setMessage(json.error?.message ?? "No se pudo perfilar.");
                return;
              }
              setNeedsReview(json.needsReview ?? []);
              const conflictsResponse = await send(props.config, `/api/v1/migrations/${runId}/conflicts`);
              const conflictsJson = (await conflictsResponse.json()) as { conflicts?: ConflictRow[] };
              setConflicts(conflictsJson.conflicts ?? []);
              setStep(2);
            })();
          }}
        >
          Perfilar
        </button>
      ) : null}
      {step === 2 ? (
        <div>
          <ul className="mb-3 text-sm text-amber-800">
            {needsReview.map((column) => (
              <li key={column.column}>NEEDS_REVIEW {column.column} ({column.confidence})</li>
            ))}
          </ul>
          {conflicts.map((conflict) => (
            <form
              key={conflict.id}
              className="mb-3 rounded border bg-white p-3 text-sm"
              onSubmit={(event) => {
                event.preventDefault();
                const rationale = new FormData(event.currentTarget).get("rationale");
                void (async () => {
                  const response = await send(props.config, `/api/v1/migrations/${runId}/decisions`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      conflictId: conflict.id,
                      action: "KEEP_SEPARATE",
                      rationale: typeof rationale === "string" ? rationale : "",
                    }),
                  });
                  const json = (await response.json()) as { error?: { message?: string } };
                  setMessage(response.ok ? "Decisión registrada." : (json.error?.message ?? "No se pudo registrar."));
                  if (response.ok) setConflicts((rows) => rows.filter((row) => row.id !== conflict.id));
                })();
              }}
            >
              <p>{conflict.summary} ({conflict.status})</p>
              <input name="rationale" required className="mt-2 w-full rounded border px-2 py-2" placeholder="Justificación" />
              <button type="submit" className="touch mt-2 rounded border px-3">Registrar decisión</button>
            </form>
          ))}
          <button type="button" className="touch rounded border px-3 text-sm" disabled={conflicts.length > 0} onClick={() => setStep(3)}>Continuar</button>
        </div>
      ) : null}
      {step === 3 ? (
        <button
          type="button"
          className="touch rounded bg-[var(--accent)] px-3 text-sm text-white"
          onClick={() => {
            void (async () => {
              const response = await send(props.config, `/api/v1/migrations/${runId}/resume`, { method: "POST" });
              const json = (await response.json()) as { status?: string; error?: { message?: string } };
              setMessage(response.ok ? `Carga ${json.status ?? "completada"}.` : (json.error?.message ?? "No se pudo reanudar."));
            })();
          }}
        >
          Reanudar carga
        </button>
      ) : null}
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
