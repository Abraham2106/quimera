import { useEffect, useState } from "react";

import { fetchCustomerProvenance, fetchCustomers, fetchEquipment } from "../api/client.js";
import type { CustomerListItem, ProvenanceEntry } from "../api/types.js";
import type { DevApiConfig } from "../config.js";
import { SearchIcon } from "./Icons.js";
import { ProvenanceDisclosure } from "./ProvenanceDisclosure.js";

export function CustomersView(props: { readonly config: DevApiConfig }) {
  const [customers, setCustomers] = useState<readonly CustomerListItem[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [equipment, setEquipment] = useState<readonly { id: string; serialNumber: string | null }[]>([]);
  const [entries, setEntries] = useState<readonly ProvenanceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCustomers(props.config)
      .then((rows) => {
        setCustomers(rows);
        if (rows[0]) setSelected((prev) => prev || rows[0]!.id);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudieron cargar los clientes."));
  }, [props.config]);

  useEffect(() => {
    if (!selected) return;
    void fetchEquipment(props.config, selected).then(setEquipment);
    void fetchCustomerProvenance(props.config, selected)
      .then((prov) => setEntries(prov.provenance?.entries ?? []))
      .catch(() => setEntries([]));
  }, [props.config, selected]);

  const shown = customers.filter((customer) =>
    customer.legalName.toLowerCase().includes(query.toLowerCase()),
  );
  const current = customers.find((c) => c.id === selected) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr] lg:items-start">
      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]/70 p-4">
          <h2 className="text-base font-semibold text-[var(--ink)]">Clientes y equipos</h2>
          <div className="relative mt-3">
            <SearchIcon
              width={16}
              height={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]"
            />
            <input
              className="field pl-9"
              placeholder="Buscar cliente…"
              value={query}
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {error ? <p className="mt-2 text-xs text-[var(--status-warn-ink)]">{error}</p> : null}
        </div>
        <ul className="pane-scroll max-h-[min(70dvh,40rem)] divide-y divide-[var(--border-subtle)]">
          {shown.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
              {query.trim() ? "Ningún cliente coincide con la búsqueda." : "No hay clientes registrados."}
            </li>
          ) : null}
          {shown.map((customer) => {
            const active = selected === customer.id;
            return (
              <li key={customer.id}>
                <button
                  type="button"
                  className={`touch relative flex w-full min-w-0 items-center justify-between px-4 py-3 text-left text-sm ${
                    active
                      ? "bg-[var(--p-surface)] font-semibold text-[var(--ink)]"
                      : "hover:bg-[var(--surface-subtle)]"
                  }`}
                  aria-current={active ? "true" : undefined}
                  onClick={() => setSelected(customer.id)}
                >
                  <span className="truncate" title={customer.legalName}>{customer.legalName}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card min-w-0 p-5 sm:p-6">
        {!current ? (
          <p className="py-14 text-center text-sm text-[var(--ink-muted)]">Seleccione un cliente.</p>
        ) : (
          <div className="space-y-5">
            <h3 className="break-words border-b border-[var(--border-subtle)] pb-4 text-xl font-medium text-[var(--ink)]">
              {current.legalName}
            </h3>

            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Equipo</h3>
              {equipment.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ink-muted)]">Sin equipos asociados.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--border-subtle)]">
                  {equipment.map((item) => (
                    <li
                      key={item.id}
                      className="num min-w-0 truncate py-2.5 text-sm font-medium text-[var(--ink)]"
                      title={item.serialNumber ?? item.id}
                    >
                      {item.serialNumber ?? item.id}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ProvenanceDisclosure entries={entries} loading={false} error={null} />
          </div>
        )}
      </section>
    </div>
  );
}
