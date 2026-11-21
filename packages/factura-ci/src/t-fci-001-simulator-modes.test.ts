import { describe, expect, it, afterEach } from "vitest";

import { startSimulator, type SimulatorHandle } from "./simulator/index.js";
import { loopbackRequest } from "./sut-fixtures/http.js";

describe("T-FCI-001 — simulator response modes", () => {
  let sim: SimulatorHandle | undefined;

  afterEach(async () => {
    await sim?.close();
    sim = undefined;
  });

  it.each([
    ["accepted", 201],
    ["rejected", 201],
    ["processing", 202],
    ["unavailable_503", 503],
    ["rate_limit_429", 429],
    ["conflict_409", 201],
  ] as const)("mode %s", async (mode, expectedStatus) => {
    sim = await startSimulator({ seed: 42, mode });
    const clave = "50612112000310111111110010000000001000000001234567890";
    const body = JSON.stringify({
      clave,
      consecutivo: "0000000001",
      emisor: { numeroIdentificacion: "3101111111" },
    });
    const res = await loopbackRequest("POST", `${sim.baseUrl}/recepcion`, body);
    expect(res.status).toBe(expectedStatus);
    if (mode === "rate_limit_429") {
      expect(res.headers["retry-after"]).toBe("2");
    }
    const posts = sim.getLog().filter((e) => e.method === "POST");
    expect(posts[0]?.clave).toBe(clave);
  });

  it("processing mode polls until aceptado", async () => {
    sim = await startSimulator({ seed: 42, mode: "processing" });
    const clave = "50612112000310111111110010000000000002000000001234567891";
    await loopbackRequest(
      "POST",
      `${sim.baseUrl}/recepcion`,
      JSON.stringify({ clave, consecutivo: "0000000002" }),
    );
    const g1 = await loopbackRequest("GET", `${sim.baseUrl}/recepcion/${clave}`);
    const g2 = await loopbackRequest("GET", `${sim.baseUrl}/recepcion/${clave}`);
    const g3 = await loopbackRequest("GET", `${sim.baseUrl}/recepcion/${clave}`);
    expect(JSON.parse(g1.body)["ind-estado"]).toBe("procesando");
    expect(JSON.parse(g2.body)["ind-estado"]).toBe("procesando");
    expect(JSON.parse(g3.body)["ind-estado"]).toBe("aceptado");
  });

  it("tcp_cut_post destroys socket after body read", async () => {
    sim = await startSimulator({ seed: 42, mode: "tcp_cut_post" });
    const clave = "50612112000310111111110010000000000003000000001234567892";
    const res = await loopbackRequest(
      "POST",
      `${sim.baseUrl}/recepcion`,
      JSON.stringify({ clave, consecutivo: "0000000003" }),
    );
    expect(res.networkError || res.status === 0).toBe(true);
    expect(sim.getLog().filter((e) => e.method === "POST")).toHaveLength(1);
    const st = await loopbackRequest("GET", `${sim.baseUrl}/recepcion/${clave}`);
    expect(st.status).toBe(200);
  });
});