import { useState } from "react";

import type { ProvenanceEntry } from "../api/types.js";

type Props = {
  readonly entries: readonly ProvenanceEntry[] | null;
  readonly loading: boolean;
  readonly error: string | null;
};

export function ProvenanceDisclosure({ entries, loading, error }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <button
        type="button"
        className="text-left text-sm font-medium text-[var(--focus)] underline-offset-2 hover:underline"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        ¿De dónde viene este dato?
      </button>
      {open ? (
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          {loading ? <p>Cargando procedencia…</p> : null}
          {error ? <p className="text-amber-800">{error}</p> : null}
          {!loading && !error && entries && entries.length === 0 ? (
            <p>Sin registros de migración para este cliente.</p>
          ) : null}
          {!loading && entries && entries.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <span className="font-medium">{entry.fieldPath}</span>
                  {" — "}
                  {entry.originKind} ({entry.transformationId},{" "}
                  {entry.ruleVersion})
                  {entry.artifactName ? ` — archivo ${entry.artifactName}` : ""}
                  {entry.sourceLocator ? ` — fila ${entry.sourceLocator}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}