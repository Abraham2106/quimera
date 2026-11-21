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
    <div className="fixed inset-0 z-30 flex justify-end bg-[#1a1511]/40 backdrop-blur-[1px]">
      <div className="flex-1" onClick={props.onClose} aria-hidden="true" />
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl"
        role="dialog"
        aria-label="Cola sin conexión"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">Sincronización</h2>
            <p className="text-xs text-[var(--ink-muted)]">
              {rows.length} {rows.length === 1 ? "operación pendiente" : "operaciones pendientes"}
            </p>
          </div>
          <button type="button" className="touch btn-secondary text-xs" onClick={props.onClose}>
            Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <button
            type="button"
            className="touch btn-primary mb-4 w-full"
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

          {rows.length === 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
              No hay cambios pendientes en el dispositivo.
            </div>
          ) : (
            <ul className="space-y-3 text-sm">
              {rows.map((row) => (
                <li
                  key={row.clientMutationId}
                  className="rounded-xl border border-[var(--border-subtle)] bg-white p-3.5 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="num text-xs font-semibold text-[var(--ink)]">
                      {row.kind} · orden {row.workOrderId.slice(0, 8)}
                    </p>
                    {!conflicts.includes(row.clientMutationId) ? (
                      <span className="rounded-full bg-[var(--status-warn)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--status-warn-ink)]">
                        En cola
                      </span>
                    ) : null}
                  </div>
                  <p className="num mt-1 text-xs text-[var(--ink-muted)]">
                    {new Date(row.enqueuedAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" })}
                  </p>
                  {conflicts.includes(row.clientMutationId) ? (
                    <div
                      className="mt-3 rounded-lg border border-amber-300 bg-[var(--status-warn)] p-3 text-xs text-amber-950"
                      role="alert"
                    >
                      <p className="font-semibold">Conflicto HTTP 409: la orden cambió en el servidor.</p>
                      <button
                        type="button"
                        className="touch btn-secondary mt-2 text-xs"
                        onClick={() => {
                          void openOfflineDatabase(indexedDB)
                            .then((db) => removeMutation(db, row.clientMutationId))
                            .then(refresh);
                        }}
                      >
                        Descartar borrador local
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
