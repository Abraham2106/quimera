export type QueuedMutation = {
  readonly clientMutationId: string;
  readonly workOrderId: string;
  readonly expectedVersion: number;
  readonly kind: "diagnosis" | "material" | "attachment";
  readonly payload: Record<string, unknown>;
  readonly enqueuedAt: string;
};

export type SyncPostResult = {
  readonly status: number;
  readonly body: unknown;
};

const DB_NAME = "oficios-offline";
const STORE = "mutations";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
  });
}

export function openOfflineDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientMutationId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
  });
}

export async function enqueueMutation(db: IDBDatabase, item: QueuedMutation): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  await requestToPromise(tx.objectStore(STORE).put(item));
}

export async function listMutations(db: IDBDatabase): Promise<QueuedMutation[]> {
  const tx = db.transaction(STORE, "readonly");
  const rows = await requestToPromise(tx.objectStore(STORE).getAll());
  return (rows as QueuedMutation[]).slice().sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
}

export async function removeMutation(db: IDBDatabase, clientMutationId: string): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  await requestToPromise(tx.objectStore(STORE).delete(clientMutationId));
}

export async function flushMutationQueue(
  db: IDBDatabase,
  post: (item: QueuedMutation) => Promise<SyncPostResult>,
): Promise<{ applied: string[]; conflicts: string[] }> {
  const applied: string[] = [];
  const conflicts: string[] = [];
  const pending = await listMutations(db);
  for (const item of pending) {
    const result = await post(item);
    if (result.status === 409) {
      conflicts.push(item.clientMutationId);
      break;
    }
    if (result.status >= 200 && result.status < 300) {
      await removeMutation(db, item.clientMutationId);
      applied.push(item.clientMutationId);
    } else {
      break;
    }
  }
  return { applied, conflicts };
}
