import { createPostgresClient } from "../db/connection.js";
import { runFiscalWorker } from "./run-fiscal-worker.js";

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

const code = await runFiscalWorker({
  client,
  tenantId,
  shouldStop: () => stop,
});

await client.end({ timeout: 5 });
process.exit(code);