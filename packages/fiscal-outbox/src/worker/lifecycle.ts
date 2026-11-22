export type WorkerCycle = {
  readonly claimedId: string | null;
  /** Cola vacía: el worker debe esperar con backoff en lugar de salir. */
  readonly idle?: boolean;
};

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Deja de reclamar documentos cuando shouldStop pasa a true (SIGTERM) y libera
 * el lease que todavía esté en curso. El AbortSignal despierta el backoff y
 * cancela las llamadas HTTP en curso.
 */
export async function runWorkerUntilStop(options: {
  processOnce: (signal?: AbortSignal) => Promise<WorkerCycle>;
  releaseLease: (documentId: string) => Promise<void>;
  shouldStop: () => boolean;
  idleBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}): Promise<number> {
  const idleBackoffMs = options.idleBackoffMs ?? 2_000;
  const sleep = options.sleep ?? ((ms: number) => abortableSleep(ms, options.signal));
  const stopped = () => options.shouldStop() || Boolean(options.signal?.aborted);

  while (!stopped()) {
    const cycle = await options.processOnce(options.signal);
    if (stopped()) {
      if (cycle.claimedId) {
        await options.releaseLease(cycle.claimedId);
      }
      break;
    }
    if (cycle.idle) {
      await sleep(idleBackoffMs);
    }
  }
  return 0;
}
