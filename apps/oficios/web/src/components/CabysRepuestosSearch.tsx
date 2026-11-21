import { useState, type FormEvent } from "react";

import { searchCabysRepuestos } from "../api/client.js";
import type { CabysItem } from "../api/types.js";
import type { DevApiConfig } from "../config.js";
import { SearchIcon } from "./Icons.js";

type Props = {
  readonly config: DevApiConfig;
  readonly onPick?: (code: string) => void;
};

export function CabysRepuestosSearch(props: Props) {
  const { config } = props;
  const [query, setQuery] = useState("refriger");
  const [items, setItems] = useState<readonly CabysItem[]>([]);
  const [metaSource, setMetaSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await searchCabysRepuestos(config, query);
      setItems(result.data.cabys ?? []);
      setMetaSource(result.meta.source);
    } catch (err) {
      setItems([]);
      setMetaSource(null);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo buscar repuestos en el catálogo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Repuestos</h3>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Busque códigos CAByS para armar el Presupuesto (vía API del taller).
          </p>
        </div>
        {metaSource ? (
          <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
            Fuente: {metaSource}
          </span>
        ) : null}
      </div>

      <form className="mt-3 flex flex-wrap gap-2" onSubmit={onSearch}>
        <label className="sr-only" htmlFor="cabys-q">
          Búsqueda CAByS
        </label>
        <div className="relative min-w-[13rem] flex-1">
          <SearchIcon
            width={16}
            height={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]"
          />
          <input
            id="cabys-q"
            className="field pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          className="touch inline-flex items-center justify-center rounded-lg bg-[var(--surface-rail)] px-4 text-sm font-medium text-white transition-colors hover:bg-[#312922] disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Buscando…" : "Buscar repuestos"}
        </button>
      </form>

      {error ? <p className="mt-2 text-sm text-amber-800">{error}</p> : null}

      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white">
          {items.map((item) => (
            <li
              key={item.codigo ?? item.descripcion}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-[var(--surface-subtle)]"
            >
              <div className="min-w-0 flex-1">
                <span className="num font-semibold text-[var(--ink)]">{item.codigo}</span>
                {item.descripcion ? (
                  <span className="ml-2 text-xs text-[var(--ink-muted)]">{item.descripcion}</span>
                ) : null}
              </div>
              {item.codigo && props.onPick ? (
                <button
                  type="button"
                  className="touch rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-tint)] px-3 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
                  onClick={() => props.onPick?.(item.codigo!)}
                >
                  Usar {item.codigo}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
