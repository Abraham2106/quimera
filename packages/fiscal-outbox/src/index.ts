import { QUIMERA_CORE_VERSION } from "@quimera/core";

export const FISCAL_OUTBOX_MODULE = "fiscal-outbox" as const;

export type FiscalOutboxBootstrap = {
  readonly module: typeof FISCAL_OUTBOX_MODULE;
  readonly coreVersion: typeof QUIMERA_CORE_VERSION;
};

export function fiscalOutboxBootstrap(): FiscalOutboxBootstrap {
  return {
    module: FISCAL_OUTBOX_MODULE,
    coreVersion: QUIMERA_CORE_VERSION,
  };
}

export {
  createPostgresClient,
  resolveDatabaseUrl,
  assertFobTenantId,
  withFobTenantTransaction,
  FiscalOutboxDbError,
  INIT_FOB_MIGRATION_SQL_PATH,
  FOB_RLS_MIGRATION_SQL_PATH,
  FOB_FISCAL_CREDENTIALS_MIGRATION_SQL_PATH,
  applyFobMigration,
  applyFobRlsMigration,
  applyFobFiscalCredentialsMigration,
  dropFobObjects,
} from "./db/index.js";

export {
  PgDocumentStore,
  enqueueIntent,
  allocateConsecutive,
  type PgDocumentStoreScope,
  type AllocateConsecutiveScope,
  type EnqueueFiscalIntentInput,
  type FiscalIntentRecord,
  type FiscalEnvironment,
  type FiscalIntentStatus,
  upsertFiscalCredentials,
  listFiscalCredentialMetadata,
  loadSealedCredential,
  productionCertificateIsValid,
  promoteIssuerToProduction,
  readIssuerActiveEnvironment,
  type FiscalCredentialEnvironment,
  type FiscalCredentialUploadInput,
  type FiscalCredentialUploadResult,
  type StoredFiscalCredentialMeta,
} from "./store/index.js";

export {
  processOnce,
  claimNextDocument,
  releaseDocumentLease,
  isPostDispatched,
  type FiscalOutboxTransport,
  type ProcessOnceOptions,
  type ProcessOnceResult,
  type TransportCallResult,
  type ClaimedFiscalDocument,
  type FobDeliveryState,
} from "./worker/index.js";

export {
  LocalFiscalVault,
  LocalKeyProvider,
  LocalKeyRing,
  redactFiscalSecrets,
  redactFiscalObject,
  redactFiscalLog,
  FISCAL_REDACTED,
  type FiscalCredentialVaultPort,
  asFiscalCredentialVault,
  type FiscalSecretKind,
  type FiscalSecretEnvironment,
  type SealedSecret,
} from "./vault/port.js";

export { zeroBuffer, zeroBuffers } from "./vault/secret-buffer.js";
export { fiscalSecretAad, DEFAULT_KEK_ID, type EnvelopeKeyProvider } from "./vault/local-envelope.js";

export {
  createFiscalCredentialVault,
  resolveFiscalVaultKind,
  resolveLocalKek,
  createEphemeralLocalVault,
  TEST_KEK_ID,
  type FiscalVaultKind,
  type CreateFiscalCredentialVaultOptions,
} from "./vault/create-fiscal-vault.js";

export {
  HttpKeyProvider,
  LoopbackHttpKeyProvider,
  createLoopbackVaultHttpHandlers,
  resolveSecureVaultUrl,
  DEFAULT_VAULT_HTTP_TIMEOUT_MS,
  type HttpKeyProviderOptions,
} from "./vault/http-key-provider.js";

export { HttpFiscalVault } from "./vault/http-fiscal-vault.js";

export {
  assessPkcs12Upload,
  assertCanPromoteToProduction,
  signedXmlMustExistBeforePost,
} from "./vault/certificate-policy.js";

export {
  evaluatePromoteToProduction,
  isSandboxEnvironment,
  type PromoteToProductionInput,
  type PromoteToProductionResult,
} from "./config/promote-to-production.js";