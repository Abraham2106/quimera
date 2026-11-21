import { describe, expect, it } from "vitest";
import { getPassportById } from "../../src/registry.js";
import {
  createPassportMcpServer,
  listRegisteredMcpToolNames,
} from "../../src/mcp/server.js";

describe("T-PASS-007 — fichas SNIT/Correos y registro MCP", () => {
  it("fichas informativas tienen accessTier declarado", async () => {
    const snit = await getPassportById("cr.snit.geodata");
    const correos = await getPassportById("cr.correos.pymexpress");
    expect(snit?.accessTier).toBe("public_ogc");
    expect(snit?.executable).toBe(false);
    expect(correos?.accessTier).toBe("private_contract_required");
    expect(correos?.executable).toBe(false);
    expect(Object.keys(correos?.operations ?? {})).toHaveLength(0);
  });

  it("servidor MCP registra herramientas passport_*", () => {
    const names = listRegisteredMcpToolNames();
    expect(names).toEqual([
      "passport_list",
      "passport_inspect",
      "passport_query",
      "passport_verify",
    ]);
    const server = createPassportMcpServer();
    expect(server).toBeDefined();
  });
});