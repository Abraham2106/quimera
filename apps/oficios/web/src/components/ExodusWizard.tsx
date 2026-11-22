import { useState } from "react";

import type { DevApiConfig } from "../config.js";
import { appendDevAuthHeaders } from "../dev-auth-headers.js";
import { UploadCloudIcon } from "./Icons.js";

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
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <section className="card p-5 sm:p-6">
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Data Exodus</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Cargue el archivo, revise NEEDS_REVIEW, resuelva conflictos y reanude la carga sin usar la CLI.
        </p>
      </div>

      <div className="my-6">
        <div className="stage-rail" aria-hidden="true">
          <span style={{ ["--stage" as string]: (step + 0.08) / (STEPS.length - 1) }} />
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((label, index) => {
            const done = index < step;
            const active = index === step;
            return (
              <li
                key={label}
                className={
                  active
                    ? "text-sm font-medium text-[var(--accent)]"
                    : done
                      ? "text-sm text-[var(--ink)]"
                      : "text-sm text-[var(--ink-muted)]"
                }
              >
                {index + 1}. {label}
              </li>
            );
          })}
        </ol>
      </div>

      {step === 0 ? (
        <form
          className="flex flex-col items-center rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)]/50 p-8 text-center"
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
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-tint)] text-[var(--accent)]">
            <UploadCloudIcon width={24} height={24} />
          </span>
          <p className="mt-3 text-sm font-semibold text-[var(--ink)]">
            Seleccione un archivo CSV, XLSX o XML de clientes / equipos
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Cada columna ambigua quedará marcada como NEEDS_REVIEW para confirmación humana.
          </p>
          <label className="touch btn-secondary mt-4 cursor-pointer">
            Elegir archivo
            <input
              name="file"
              type="file"
              accept=".csv,.xlsx,.xml,text/csv"
              className="sr-only"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
            />
          </label>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{fileName ?? "Ningún archivo elegido"}</p>
          <button type="submit" className="touch btn-primary mt-5">
            Subir
          </button>
        </form>
      ) : null}

      {step === 1 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-5">
          <p className="text-sm text-[var(--ink)]">
            Corrida preparada <span className="num font-semibold">{runId}</span>. Ejecute el perfilado para
            detectar columnas ambiguas y posibles duplicados.
          </p>
          <button
            type="button"
            className="touch btn-primary mt-4"
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
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          {needsReview.length > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-[var(--status-warn)] p-4">
              <p className="text-sm font-medium text-amber-950">Columnas marcadas como NEEDS_REVIEW</p>
              <ul className="mt-2 space-y-1 text-sm text-amber-950">
                {needsReview.map((column) => (
                  <li key={column.column} className="num">
                    NEEDS_REVIEW {column.column} ({column.confidence})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {conflicts.map((conflict) => (
            <form
              key={conflict.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-sm"
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
              <p className="font-semibold text-[var(--ink)]">
                {conflict.summary} <span className="num text-xs text-[var(--ink-muted)]">({conflict.status})</span>
              </p>
              <input name="rationale" required className="field mt-2.5" placeholder="Justificación de la decisión" />
              <button type="submit" className="touch btn-secondary mt-3">
                Registrar decisión
              </button>
            </form>
          ))}

          <button
            type="button"
            className="touch btn-primary"
            disabled={conflicts.length > 0}
            onClick={() => setStep(3)}
          >
            Continuar
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="rounded-xl border border-emerald-200 bg-[var(--status-done)]/60 p-5">
          <p className="text-sm font-medium text-[var(--ink)]">
            Todos los conflictos han sido resueltos. Puede reanudar la carga final hacia el taller.
          </p>
          <button
            type="button"
            className="touch btn-primary mt-4"
            onClick={() => {
              void (async () => {
                const response = await send(props.config, `/api/v1/migrations/${runId}/resume`, { method: "POST" });
                const json = (await response.json()) as { status?: string; error?: { message?: string } };
                setMessage(
                  response.ok
                    ? `Carga ${json.status ?? "completada"}.`
                    : (json.error?.message ?? "No se pudo reanudar."),
                );
              })();
            }}
          >
            Reanudar carga
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-2.5 text-sm text-[var(--ink)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
