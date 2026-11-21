export type WorkerCycle = {
  readonly claimedId: string | null;
};

/**
 * Deja de reclamar documentos cuando shouldStop pasa a true (SIGTERM) y libera
 * el lease que todavía esté en curso.
 */
export async function runWorkerUntilStop(options: {
  processOnce: () => Promise<WorkerCycle>;
  releaseLease: (documentId: string) => Promise<void>;
  shouldStop: () => boolean;
}): Promise<number> {
  while (!options.shouldStop()) {
    const cycle = await options.processOnce();
    if (options.shouldStop()) {
      if (cycle.claimedId) {
        await options.releaseLease(cycle.claimedId);
      }
      break;
    }
    if (!cycle.claimedId) {
      break;
    }
  }
  return 0;
}
