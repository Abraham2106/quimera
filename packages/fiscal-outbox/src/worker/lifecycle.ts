export type WorkerCycle = {
  readonly claimedId: string | null;
  /** Cola vacía: el worker debe esperar con backoff en lugar de salir. */
  readonly idle?: boolean;
};

/**
 * Deja de reclamar documentos cuando shouldStop pasa a true (SIGTERM) y libera
 * el lease que todavía esté en curso.
 */
export async function runWorkerUntilStop(options: {
  processOnce: () => Promise<WorkerCycle>;
  releaseLease: (documentId: string) => Promise<void>;
  shouldStop: () => boolean;
  idleBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<number> {
  const idleBackoffMs = options.idleBackoffMs ?? 2_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  while (!options.shouldStop()) {
    const cycle = await options.processOnce();
    if (options.shouldStop()) {
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
