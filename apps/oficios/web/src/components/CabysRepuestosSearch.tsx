import { useState, type FormEvent } from "react";

import { searchCabysRepuestos } from "../api/client.js";
import type { DevApiConfig } from "../config.js";
import type { CabysItem } from "../api/types.js";

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
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Repuestos</h2>
      <p className="mt-1 text-sm text-slate-600">
        Busque códigos CAByS para armar el Presupuesto (vía API del taller).
      </p>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={onSearch}>
        <label className="sr-only" htmlFor="cabys-q">
          Búsqueda CAByS
        </label>
        <input
          id="cabys-q"
          className="min-w-[12rem] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        <button
          type="submit"
          className="touch rounded bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Buscando…" : "Buscar repuestos"}
        </button>
      </form>
      {metaSource ? (
        <p className="mt-2 text-xs text-slate-500">Fuente: {metaSource}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-amber-800">{error}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-slate-100 rounded border border-slate-100">
          {items.map((item) => (
            <li key={item.codigo ?? item.descripcion} className="px-3 py-2 text-sm">
              {item.codigo && props.onPick ? (
                <button type="button" className="touch font-mono text-[var(--accent)]" onClick={() => props.onPick?.(item.codigo!)}>
                  Usar {item.codigo}
                </button>
              ) : (
                <span className="font-mono text-slate-800">{item.codigo}</span>
              )}
              {item.descripcion ? (
                <span className="text-slate-600"> — {item.descripcion}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}