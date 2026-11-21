import { useEffect, useState } from "react";

import { fetchCustomers, fetchEquipment } from "../api/client.js";
import type { CustomerListItem } from "../api/types.js";
import type { DevApiConfig } from "../config.js";
import { ProvenanceDisclosure } from "./ProvenanceDisclosure.js";
import { fetchCustomerProvenance } from "../api/client.js";
import type { ProvenanceEntry } from "../api/types.js";

export function CustomersView(props: { readonly config: DevApiConfig }) {
  const [customers, setCustomers] = useState<readonly CustomerListItem[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [equipment, setEquipment] = useState<readonly { id: string; serialNumber: string | null }[]>([]);
  const [entries, setEntries] = useState<readonly ProvenanceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCustomers(props.config)
      .then(setCustomers)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudieron cargar los clientes."));
  }, [props.config]);

  useEffect(() => {
    if (!selected) return;
    void fetchEquipment(props.config, selected).then(setEquipment);
    void fetchCustomerProvenance(props.config, selected)
      .then((prov) => setEntries(prov.provenance?.entries ?? []))
      .catch(() => setEntries([]));
  }, [props.config, selected]);

  const shown = customers.filter((customer) => customer.legalName.toLowerCase().includes(query.toLowerCase()));
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">Clientes y equipos</h2>
      <input className="mb-3 w-full rounded border px-3 py-2 text-sm" placeholder="Buscar cliente" value={query} onChange={(e) => setQuery(e.target.value)} />
      {error ? <p className="text-sm text-amber-800">{error}</p> : null}
      <ul className="divide-y rounded border bg-white">
        {shown.map((customer) => (
          <li key={customer.id}>
            <button type="button" className="touch w-full px-3 text-left text-sm" onClick={() => setSelected(customer.id)}>
              {customer.legalName}
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <div className="mt-4 rounded border bg-white p-3 text-sm">
          <h3 className="font-medium">Equipo</h3>
          <ul>
            {equipment.map((item) => (
              <li key={item.id} className="num">{item.serialNumber ?? item.id}</li>
            ))}
          </ul>
          <ProvenanceDisclosure entries={entries} loading={false} error={null} />
        </div>
      ) : null}
    </section>
  );
}
