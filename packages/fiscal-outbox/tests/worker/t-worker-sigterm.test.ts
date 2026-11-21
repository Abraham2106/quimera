import { describe, expect, it } from "vitest";

import { runWorkerUntilStop } from "../../src/worker/lifecycle.js";

describe("SIGTERM drena el worker fiscal", () => {
  it("deja de reclamar, libera el lease activo y termina en 0", async () => {
    let stop = false;
    const claims: string[] = [];
    const released: string[] = [];
    const code = await runWorkerUntilStop({
      shouldStop: () => stop,
      processOnce: async () => {
        claims.push("claim");
        stop = true;
        return { claimedId: "doc-1", idle: false };
      },
      releaseLease: async (documentId) => {
        released.push(documentId);
      },
    });
    expect(code).toBe(0);
    expect(claims).toEqual(["claim"]);
    expect(released).toEqual(["doc-1"]);
  });
});