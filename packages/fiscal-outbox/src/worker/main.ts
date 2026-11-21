import { createPostgresClient } from "../db/connection.js";
import { processOnce } from "./process-once.js";
import { releaseDocumentLease } from "./claim.js";
import { runWorkerUntilStop } from "./lifecycle.js";

const tenantId = process.env.OFICIOS_TENANT_ID ?? process.env.QUIMERA_TENANT_ID;
if (!tenantId) {
  process.stderr.write(`${JSON.stringify({ event: "worker.missing_tenant" })}\n`);
  process.exit(1);
}

const client = createPostgresClient();
let stop = false;
process.once("SIGTERM", () => {
  stop = true;
});

const code = await runWorkerUntilStop({
  shouldStop: () => stop,
  processOnce: async () => {
    await processOnce(client, {
      workerId: process.env.WORKER_ID ?? "fiscal-outbox-worker",
      tenantId,
      transport: {
        async postDocument() {
          return { error: new Error("ERR_TRANSPORT_UNCONFIGURED") };
        },
        async getByClave() {
          return { error: new Error("ERR_TRANSPORT_UNCONFIGURED") };
        },
      },
    });
    return { claimedId: null };
  },
  releaseLease: async (documentId) => {
    await releaseDocumentLease(client, tenantId, documentId);
  },
});

await client.end({ timeout: 5 });
process.exit(code);
