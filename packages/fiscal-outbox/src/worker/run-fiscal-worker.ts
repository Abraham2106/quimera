import type { Sql } from "postgres";

import { createFiscalCredentialVault } from "../vault/create-fiscal-vault.js";
import type { FiscalCredentialVaultPort } from "../vault/port.js";
import { releaseDocumentLease } from "./claim.js";
import { createFiscalWorkerTransport } from "./create-fiscal-transport.js";
import {
  loadDecryptedFiscalCredentials,
  resolveWorkerIssuerId,
} from "./fiscal-credentials.js";
import { runWorkerUntilStop } from "./lifecycle.js";
import { processOnce } from "./process-once.js";
import { writeWorkerError, writeWorkerLog } from "./worker-log.js";

export type RunFiscalWorkerOptions = {
  readonly client: Sql;
  readonly tenantId: string;
  readonly shouldStop: () => boolean;
  readonly vault?: FiscalCredentialVaultPort;
  readonly workerId?: string;
  readonly idleBackoffMs?: number;
  readonly signal?: AbortSignal;
};

export async function runFiscalWorker(options: RunFiscalWorkerOptions): Promise<number> {
  const vault = options.vault ?? createFiscalCredentialVault();
  const workerId = options.workerId ?? process.env.WORKER_ID ?? "fiscal-outbox-worker";

  let transportBundle: Awaited<ReturnType<typeof createFiscalWorkerTransport>>;
  try {
    const issuerId = await resolveWorkerIssuerId(options.client, options.tenantId);
    const credentials = await loadDecryptedFiscalCredentials(
      options.client,
      vault,
      options.tenantId,
      issuerId,
    );
    transportBundle = await createFiscalWorkerTransport({ credentials });
    writeWorkerLog({
      event: "worker.transport.ready",
      tenantId: options.tenantId,
      issuerId,
      environment: credentials.environment,
    });
  } catch (error) {
    writeWorkerError({
      event: "worker.transport.failed",
      message: error instanceof Error ? error.message : "ERR_WORKER_BOOT",
    });
    throw error;
  }

  return runWorkerUntilStop({
    shouldStop: options.shouldStop,
    idleBackoffMs: options.idleBackoffMs,
    signal: options.signal,
    processOnce: async (signal) => {
      try {
        const result = await processOnce(options.client, {
          workerId,
          tenantId: options.tenantId,
          transport: transportBundle.transport,
          signXml: transportBundle.signXml,
          signal,
        });
        if (result.processed) {
          writeWorkerLog({
            event: "worker.cycle",
            action: result.action,
            clave: result.clave,
          });
        }
        return { claimedId: result.processed ? (result.documentId ?? null) : null, idle: !result.processed };
      } catch (error) {
        writeWorkerError({
          event: "worker.cycle.error",
          message: error instanceof Error ? error.message : "ERR_WORKER_CYCLE",
        });
        return { claimedId: null, idle: true };
      }
    },
    releaseLease: async (documentId) => {
      await releaseDocumentLease(options.client, options.tenantId, documentId, workerId);
      writeWorkerLog({ event: "worker.lease.released", documentId });
    },
  });
}