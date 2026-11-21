export const PASSPORT_CLI_COMMANDS = [
  "list",
  "inspect",
  "query",
  "verify",
  "generate",
] as const;

export const PASSPORT_MCP_TOOLS = [
  "passport_list",
  "passport_inspect",
  "passport_query",
  "passport_verify",
] as const;

export type PassportCapabilities = {
  readonly module: "@quimera/cr-api-passport";
  readonly cli: {
    readonly binary: "quimera-passport";
    readonly commands: readonly string[];
    readonly modes: readonly ["fixture", "mock", "live"];
    readonly exitCodes: Record<string, number>;
  };
  readonly mcp: {
    readonly transport: "stdio";
    readonly tools: readonly string[];
  };
  readonly features: {
    readonly rateLimitGuardrail: { burstPerSec: 15; sustainedPerSec: 8 };
    readonly offlineFixtureMode: true;
    readonly driftVerification: true;
  };
};

export function getCapabilities(): PassportCapabilities {
  return {
    module: "@quimera/cr-api-passport",
    cli: {
      binary: "quimera-passport",
      commands: PASSPORT_CLI_COMMANDS,
      modes: ["fixture", "mock", "live"],
      exitCodes: {
        ok: 0,
        error: 1,
        usage: 2,
        authMissing: 4,
        contractDrift: 5,
      },
    },
    mcp: {
      transport: "stdio",
      tools: PASSPORT_MCP_TOOLS,
    },
    features: {
      rateLimitGuardrail: { burstPerSec: 15, sustainedPerSec: 8 },
      offlineFixtureMode: true,
      driftVerification: true,
    },
  };
}