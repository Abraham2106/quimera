import { useState } from "react";

import type { DevApiConfig } from "../config.js";
import { appendDevAuthHeaders } from "../dev-auth-headers.js";

type NeedsReview = {
  column: string;
  status: string;
  confidence: number;
};

type ConflictRow = {
  id: string;
  status: string;
  summary: string;
};

async function send(config: DevApiConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (config.accessToken.trim()) {
    headers.set("authorization", `Bearer ${config.accessToken.trim()}`);
  }
  const raw: Record<string, string> = {};
  headers.forEach((value, key) => {
    raw[key] = value;
  });
  appendDevAuthHeaders(config, raw);
  return fetch(`${config.apiBase}${path}`, {
    ...init,
    headers: raw,
  });
}

export function MigrationWorkbench({ config }: { config: DevApiConfig }) {
  const [runId, setRunId] = useState("");
  const [needsReview, setNeedsReview] = useState<NeedsReview[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="mb-6 rounded border border-slate-200 p-4">
      <h2 className="text-base font-semibold text-slate-900">Data Exodus</h2>
      <p className="mb-3 text-sm text-slate-600">
        Subí el archivo, revisá NEEDS_REVIEW, resolvé conflictos y reanudá la carga sin usar la CLI.
      </p>
      <form
        className="mb-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("file");
          const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
          if (!file) return;
          void (async () => {
            const body = new FormData();
            body.set("file", file);
            const response = await send(config, "/api/v1/migrations/uploads", { method: "POST", body });
            const json = (await response.json()) as { runId?: string; error?: { message?: string } };
            if (!response.ok || !json.runId) {
              setMessage(json.error?.message ?? "No se pudo subir el archivo.");
              return;
            }
            setRunId(json.runId);
            setMessage(`Archivo recibido. Corrida ${json.runId}.`);
          })();
        }}
      >
        <input name="file" type="file" accept=".csv,.xlsx,.xml,text/csv" />
        <button type="submit" className="rounded bg-sky-800 px-3 py-2 text-sm text-white">
          Subir
        </button>
      </form>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          disabled={!runId}
          onClick={() => {
            void (async () => {
              const response = await send(config, `/api/v1/migrations/${runId}/profile`, { method: "POST" });
              const json = (await response.json()) as { needsReview?: NeedsReview[]; error?: { message?: string } };
              if (!response.ok) {
                setMessage(json.error?.message ?? "No se pudo perfilar.");
                return;
              }
              setNeedsReview(json.needsReview ?? []);
              const conflictsResponse = await send(config, `/api/v1/migrations/${runId}/conflicts`);
              const conflictsJson = (await conflictsResponse.json()) as { conflicts?: ConflictRow[] };
              setConflicts(conflictsJson.conflicts ?? []);
            })();
          }}
        >
          Perfilar
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          disabled={!runId}
          onClick={() => {
            void (async () => {
              const response = await send(config, `/api/v1/migrations/${runId}/resume`, { method: "POST" });
              const json = (await response.json()) as { status?: string; error?: { message?: string } };
              setMessage(response.ok ? `Carga ${json.status ?? "completada"}.` : (json.error?.message ?? "No se pudo reanudar."));
            })();
          }}
        >
          Reanudar carga
        </button>
      </div>
      {needsReview.length > 0 ? (
        <ul className="mb-3 text-sm text-amber-800">
          {needsReview.map((column) => (
            <li key={column.column}>
              NEEDS_REVIEW {column.column} ({column.confidence})
            </li>
          ))}
        </ul>
      ) : null}
      {conflicts.map((conflict) => (
        <form
          key={conflict.id}
          className="mb-2 grid gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            const rationale = new FormData(event.currentTarget).get("rationale");
            void (async () => {
              const response = await send(config, `/api/v1/migrations/${runId}/decisions`, {
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
            })();
          }}
        >
          <p>
            {conflict.summary} ({conflict.status})
          </p>
          <input name="rationale" className="rounded border border-slate-300 px-2 py-1" placeholder="Justificación" />
          <button type="submit" className="w-fit rounded border border-slate-300 px-3 py-1">
            Registrar decisión
          </button>
        </form>
      ))}
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
