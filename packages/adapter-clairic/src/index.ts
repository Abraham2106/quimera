export {
  CLAIRIC_STUB_PROVIDER_ID,
  CLAIRIC_MODEL_ID,
  ERR_CLAIRIC_PAYLOAD_LIMIT,
  CONFIDENCE_LOW_MARKER,
  PROMPT_INJECTION_FIXTURE,
  MAX_CLAIRIC_IMAGES,
  MAX_CLAIRIC_FILE_BYTES,
  MAX_CLAIRIC_TOTAL_BYTES,
} from "./constants.js";

export {
  ClairicStubAdapter,
  createClairicStubAdapter,
} from "./clairic-stub-adapter.js";

export {
  containsRemoteUrl,
  scanBytesForRemoteUrl,
  validateClairicPayload,
} from "./limits.js";

export {
  lowConfidenceConflict,
  isFiscalFieldName,
  defaultStubConfidence,
  type ConfidenceGateMeta,
  type ClairicFieldMetaExtensions,
} from "./low-confidence.js";

export { stubExtractFromSchema, type ClairicFieldMeta } from "./stub-extract.js";

export const QUIMERA_ADAPTER_CLAIRIC_PACKAGE = "@quimera/adapter-clairic" as const;