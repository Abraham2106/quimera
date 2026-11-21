export {
  CR_API_PASSPORT_MODULE,
  crApiPassportBootstrap,
  type CrApiPassportBootstrap,
} from "./module.js";
export { MODULE_NAME, PASSPORT_ERROR_CODES, quimeraError, exitCodeForError } from "./errors.js";

export { ApiPassportSchema, type ApiPassport } from "./schema/api-passport.js";
export {
  validateAgainstJsonSchema,
  type SchemaValidationIssue,
} from "./schema/json-schema-validate.js";

export {
  loadPassportFromFile,
  loadAllPassports,
  getPassportById,
  listPassportFiles,
  passportIsQueryable,
} from "./registry.js";

export { PassportClient, type PassportClientOptions } from "./client/passport-client.js";
export { HostTokenBucket } from "./client/token-bucket.js";
export { TtlCache, cacheKey } from "./client/cache.js";
export type { QueryResult, QueryMeta, PassportMode, FetchFn } from "./client/types.js";

export {
  verifyPassport,
  verifyPassportWithFixtureFile,
  driftToQuimeraError,
  type DriftReport,
} from "./verify/verify.js";

export { generatePassportAdapter, type GenerateResult } from "./generate/generate.js";

export {
  getCapabilities,
  PASSPORT_CLI_COMMANDS,
  PASSPORT_MCP_TOOLS,
  type PassportCapabilities,
} from "./capabilities.js";

export { runCli, runCliMain, type CliRunResult } from "./cli.js";

export {
  createPassportMcpServer,
  startPassportMcpStdio,
  listRegisteredMcpToolNames,
} from "./mcp/server.js";

export { PACKAGE_ROOT, passportsDir, fixturesDir } from "./paths.js";