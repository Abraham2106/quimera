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
  FiscalOutboxDbError,
  INIT_FOB_MIGRATION_SQL_PATH,
  applyFobMigration,
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