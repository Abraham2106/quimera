export const DEMO_POS_APP = "demo-pos" as const;

export type { DemoPosMode } from "./sut-factory.js";
export { createDemoPosSut } from "./sut-factory.js";
export { createOutboxSut } from "./outbox-sut.js";
export {
  startDemoPosServer,
  createDemoPosApp,
  type DemoPosServerHandle,
} from "./server.js";
export { emisorForTenant, tenantUuidForSlug, TENANT_SLUG_TO_UUID } from "./tenant-config.js";