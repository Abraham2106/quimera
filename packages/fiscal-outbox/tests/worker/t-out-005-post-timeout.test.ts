import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { processOnce } from "../../src/worker/process-once.js";
import { resetFobSchema, seedTenant } from "../store/helpers.js";
import { buildWorkerDoc, persistWorkerDoc } from "./document-fixture.js";
import { createCountingTransport } from "./transport-mock.js";

describe.sequential("T-OUT-005 — timeout post-POST solo dispara GET", () => {
  let client: Sql | undefined;

  beforeAll(async () => {
    client = await resetFobSchema();
    await seedTenant(client);
    await persistWorkerDoc(client, buildWorkerDoc(71));
  });

  afterAll(async () => {
    await client?.end();
  });

  it("no repite POST tras timeout; segundo tick usa getByClave", async () => {
    if (!client) throw new Error("no client");

    const transport = createCountingTransport({
      post: () => ({
        error: Object.assign(new Error("ETIMEOUT"), { code: "ETIMEOUT" }),
      }),
      get: () => ({
        httpStatus: 200,
        response: { estado: "aceptado" },
        error: null,
      }),
    });

    const opts = { workerId: "w-timeout", transport };

    const first = await processOnce(client, opts);
    expect(first).toEqual({ processed: true, action: "post", clave: expect.any(String) });
    expect(transport.postCount).toBe(1);
    expect(transport.getCount).toBe(0);

    const stateAfterPost = await client<{ delivery_state: string }[]>`
      SELECT delivery_state FROM fob_fiscal_documents WHERE clave = ${first.clave}
    `;
    expect(stateAfterPost[0]?.delivery_state).toBe("INCIERTO");

    const second = await processOnce(client, opts);
    expect(second.processed).toBe(true);
    expect(transport.postCount).toBe(1);
    expect(transport.getCount).toBe(1);

    const terminal = await client<{ delivery_state: string }[]>`
      SELECT delivery_state FROM fob_fiscal_documents WHERE clave = ${first.clave}
    `;
    expect(terminal[0]?.delivery_state).toBe("ACEPTADO");
  });
});