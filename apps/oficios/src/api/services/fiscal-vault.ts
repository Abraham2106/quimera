import { createFiscalCredentialVault, type FiscalCredentialVaultPort } from "@quimera/fiscal-outbox";

export function createOficiosFiscalVault(): FiscalCredentialVaultPort {
  return createFiscalCredentialVault();
}

export const oficiosFiscalVault = createOficiosFiscalVault();