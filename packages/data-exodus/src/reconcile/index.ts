export { jaroWinkler } from "./jaro-winkler.js";
export { normalizeLegalName, sameTaxId } from "./normalize-name.js";
export { reconcileDetect, totalRecordCount } from "./engine.js";
export type {
  BalanceDeclaration,
  DetectedConflict,
  NormalizedClient,
  NormalizedInvoice,
  NormalizedPayment,
  ProvenanceEntry,
  ReconcileDataset,
  ReconcileResult,
} from "./types.js";