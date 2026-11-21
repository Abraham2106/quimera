import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "../vendor/zod.js";
import { getCapabilities, PASSPORT_MCP_TOOLS } from "../capabilities.js";
import { loadAllPassports, getPassportById } from "../registry.js";
import { PassportClient } from "../client/passport-client.js";
import { verifyPassport } from "../verify/verify.js";

function untrustedWrap(payload: unknown): { untrustedExternalData: true; data: unknown } {
  return { untrustedExternalData: true, data: payload };
}

export function createPassportMcpServer(): McpServer {
  const server = new McpServer({
    name: "quimera-cr-api-passport",
    version: "0.0.0",
  });

  const mode = process.env.QUIMERA_PASSPORT_MODE ?? "fixture";
  const client = new PassportClient({ mode });

  server.registerTool(
    "passport_list",
    {
      description: "List CR API passports and auth requirements",
      inputSchema: {
        provider: z.string().optional(),
        authType: z.enum(["public", "bearer", "basic", "private_contract"]).optional(),
      },
    },
    async (args) => {
      let passports = await loadAllPassports();
      if (args.provider) {
        passports = passports.filter((p) =>
          p.provider.name.toLowerCase().includes(args.provider!.toLowerCase()),
        );
      }
      if (args.authType) {
        passports = passports.filter((p) => p.auth.type === args.authType);
      }
      const list = passports.map((p) => ({
        id: p.passportId,
        version: p.passportVersion,
        status: p.status,
        authType: p.auth.type,
        lastVerifiedAt: p.provider.lastVerifiedAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(untrustedWrap(list), null, 2) }],
      };
    },
  );

  server.registerTool(
    "passport_inspect",
    {
      description: "Inspect a passport manifest",
      inputSchema: {
        passportId: z.string().min(1),
      },
    },
    async (args) => {
      const p = await getPassportById(args.passportId);
      if (!p) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "not found" }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(untrustedWrap(p), null, 2) }],
      };
    },
  );

  server.registerTool(
    "passport_query",
    {
      description: "Query a passport operation with guardrails",
      inputSchema: {
        passportId: z.string(),
        operation: z.string(),
        params: z.record(z.string(), z.string()).default({}),
        mode: z.enum(["fixture", "mock", "live"]).optional(),
      },
    },
    async (args) => {
      const p = await getPassportById(args.passportId);
      if (!p) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "not found" }) }],
          isError: true,
        };
      }
      const qClient = args.mode ? new PassportClient({ mode: args.mode }) : client;
      const res = await qClient.query(p, args.operation, args.params);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(untrustedWrap(res), null, 2),
          },
        ],
        isError: !res.ok,
      };
    },
  );

  server.registerTool(
    "passport_verify",
    {
      description: "Verify passport contract against fixtures or live",
      inputSchema: {
        passportId: z.string(),
        mode: z.enum(["fixture", "mock", "live"]).optional(),
      },
    },
    async (args) => {
      const p = await getPassportById(args.passportId);
      if (!p) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "not found" }) }],
          isError: true,
        };
      }
      const vClient = args.mode ? new PassportClient({ mode: args.mode }) : client;
      const report = await verifyPassport(p, { client: vClient });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(untrustedWrap(report), null, 2),
          },
        ],
        isError: report.status === "DRIFT_DETECTED",
      };
    },
  );

  return server;
}

export async function startPassportMcpStdio(): Promise<void> {
  const server = createPassportMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  void getCapabilities();
}

export function listRegisteredMcpToolNames(): readonly string[] {
  return PASSPORT_MCP_TOOLS;
}