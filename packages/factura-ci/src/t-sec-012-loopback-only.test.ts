import { describe, expect, it } from "vitest";

import { ERR_SEC_LOOPBACK_ONLY } from "./constants.js";
import { assertLoopbackHost, startSimulator, parseTargetUrl } from "./simulator/index.js";

describe("T-SEC-012 — loopback-only simulator", () => {
  it("rejects non-loopback bind host", async () => {
    await expect(startSimulator({ host: "0.0.0.0" })).rejects.toMatchObject({
      code: ERR_SEC_LOOPBACK_ONLY,
    });
  });

  it("assertLoopbackHost throws for public host", () => {
    expect(() => assertLoopbackHost("203.0.113.1")).toThrow(/ERR_SEC_LOOPBACK_ONLY/);
  });

  it("parseTargetUrl rejects non-http loopback misuse", () => {
    expect(() => parseTargetUrl("http://203.0.113.1:4010")).toThrow(
      /ERR_SEC_LOOPBACK_ONLY/,
    );
  });

  it("binds only 127.0.0.1 on ephemeral port", async () => {
    const sim = await startSimulator({ host: "127.0.0.1", port: 0 });
    expect(sim.host).toBe("127.0.0.1");
    expect(sim.port).toBeGreaterThan(0);
    await sim.close();
  });
});