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
  applyFobMigration,
  applyFobRlsMigration,
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
  redactFiscalSecrets,
  type FiscalCredentialVaultPort,
  asFiscalCredentialVault,
  type FiscalSecretKind,
  type SealedSecret,
} from "./vault/port.js";

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