import { describe, expect, it } from "vitest";

import {
  enqueueMutation,
  flushMutationQueue,
  listMutations,
  openOfflineDatabase,
  type QueuedMutation,
} from "../../web/src/offline/mutation-queue.js";

function memoryIndexedDb(): IDBFactory {
  const databases = new Map<string, Map<string, Map<string, QueuedMutation>>>();
  return {
    open(name: string) {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (!databases.has(name)) {
          databases.set(name, new Map());
        }
        const stores = databases.get(name)!;
        const db = {
          objectStoreNames: {
            contains(store: string) {
              return stores.has(store);
            },
          },
          createObjectStore(store: string) {
            stores.set(store, new Map());
          },
          transaction(store: string) {
            const map = stores.get(store);
            if (!map) throw new Error("missing store");
            return {
              objectStore() {
                return {
                  put(value: QueuedMutation) {
                    map.set(value.clientMutationId, value);
                    return done(undefined);
                  },
                  getAll() {
                    return done([...map.values()]);
                  },
                  delete(key: string) {
                    map.delete(key);
                    return done(undefined);
                  },
                };
              },
            };
          },
        };
        Object.assign(request, { result: db });
        request.onupgradeneeded?.({} as IDBVersionChangeEvent);
        request.onsuccess?.({} as Event);
      });
      return request;
    },
  } as IDBFactory;
}

function done<T>(result: T): IDBRequest<T> {
  const request = { result } as IDBRequest<T>;
  queueMicrotask(() => {
    request.onsuccess?.({} as Event);
  });
  return request;
}

function item(id: string, at: string): QueuedMutation {
  return {
    clientMutationId: id,
    workOrderId: "wo",
    expectedVersion: 1,
    kind: "diagnosis",
    payload: { notes: id },
    enqueuedAt: at,
  };
}

describe("cola IndexedDB de la PWA", () => {
  it("abre oficios-offline y reenvía en orden hasta un 409", async () => {
    const factory = memoryIndexedDb();
    const db = await openOfflineDatabase(factory);
    await enqueueMutation(db, item("b", "2026-01-02T00:00:00.000Z"));
    await enqueueMutation(db, item("a", "2026-01-01T00:00:00.000Z"));
    const listed = await listMutations(db);
    expect(listed.map((row) => row.clientMutationId)).toEqual(["a", "b"]);

    const seen: string[] = [];
    const flushed = await flushMutationQueue(db, async (mutation) => {
      seen.push(mutation.clientMutationId);
      if (mutation.clientMutationId === "b") {
        return { status: 409, body: { ok: false } };
      }
      return { status: 200, body: { ok: true } };
    });
    expect(seen).toEqual(["a", "b"]);
    expect(flushed.applied).toEqual(["a"]);
    expect(flushed.conflicts).toEqual(["b"]);
    const remaining = await listMutations(db);
    expect(remaining.map((row) => row.clientMutationId)).toEqual(["b"]);
  });
});
