import { useEffect, useState } from "react";

import type { DevApiConfig } from "../config.js";
import { postOfflineSync } from "../api/client.js";
import {
  flushMutationQueue,
  listMutations,
  openOfflineDatabase,
  removeMutation,
  type QueuedMutation,
} from "../offline/mutation-queue.js";

export function OfflineSyncDrawer(props: {
  readonly config: DevApiConfig;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCount: (count: number) => void;
}) {
  const [rows, setRows] = useState<readonly QueuedMutation[]>([]);
  const [conflicts, setConflicts] = useState<readonly string[]>([]);

  async function refresh() {
    const db = await openOfflineDatabase(indexedDB);
    const pending = await listMutations(db);
    setRows(pending);
    props.onCount(pending.length);
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [props.config]);

  if (!props.open) return null;
  return (
    <aside className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-auto border-l bg-white p-4 shadow-lg" role="dialog" aria-label="Cola sin conexión">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Sincronización</h2>
        <button type="button" className="touch rounded border px-3 text-sm" onClick={props.onClose}>Cerrar</button>
      </div>
      <button
        type="button"
        className="touch mb-3 rounded bg-[var(--accent)] px-3 text-sm text-white"
        onClick={() => {
          void (async () => {
            const db = await openOfflineDatabase(indexedDB);
            const result = await flushMutationQueue(db, (item) =>
              postOfflineSync(props.config, item.workOrderId, {
                clientMutationId: item.clientMutationId,
                expectedVersion: item.expectedVersion,
                kind: item.kind,
                ...item.payload,
              }),
            );
            setConflicts(result.conflicts);
            await refresh();
          })();
        }}
      >
        Sincronizar ahora
      </button>
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.clientMutationId} className="rounded border p-2">
            <p>{row.kind} · orden {row.workOrderId.slice(0, 8)}</p>
            <p className="text-xs text-[var(--ink-muted)]">{new Date(row.enqueuedAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" })}</p>
            {conflicts.includes(row.clientMutationId) ? (
              <div className="mt-2" role="alert">
                <p>Conflicto HTTP 409: la orden cambió en el servidor.</p>
                <button
                  type="button"
                  className="touch mt-1 rounded border px-2"
                  onClick={() => {
                    void openOfflineDatabase(indexedDB).then((db) => removeMutation(db, row.clientMutationId)).then(refresh);
                  }}
                >
                  Descartar borrador local
                </button>
              </div>
            ) : (
              <p className="text-xs">En cola</p>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
