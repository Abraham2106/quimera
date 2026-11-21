export { CORE_CONTRACT_VERSION, isContractCompatible, parseSemVer } from "./semver.js";
export type { SemVerParts } from "./semver.js";

export {
  FISCAL_MINOR_SCALE,
  CRC_CENT_SCALE,
  MoneySchema,
  parseCrMoney,
  toFiscalMinor,
  addMoney,
  subMoney,
  addFiscalAmounts,
} from "./money.js";
export type { Money, MoneyInput } from "./money.js";

export {
  canonicalizeJsonValue,
  canonicalJsonString,
  sha256CanonicalJson,
} from "./hash.js";

export { normalizeCrIdentification } from "./cr-id.js";

export * from "./schemas/index.js";
export * from "./ports/index.js";

export const QUIMERA_CORE_PACKAGE = "@quimera/core" as const;
export const QUIMERA_CORE_VERSION = "0.0.0" as const;