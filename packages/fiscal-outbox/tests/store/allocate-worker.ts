import { allocateConsecutive } from "../../src/store/sequences.js";
import { createPostgresClient } from "../../src/db/connection.js";

const count = Number(process.argv[2] ?? "0");
const tenantId = process.env.FOB_TENANT_ID;

if (!tenantId || !Number.isFinite(count) || count < 1) {
  process.exit(2);
}

const client = createPostgresClient();
const scope = {
  tenantId,
  issuerId: "3101999999",
  environment: "mock" as const,
  branch: "001",
  terminal: "00001",
  docType: "01",
};

try {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(await allocateConsecutive(client, scope));
  }
  if (process.send) {
    process.send(JSON.stringify(values));
  }
} finally {
  await client.end();
}