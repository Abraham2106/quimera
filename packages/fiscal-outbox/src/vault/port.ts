import type { FiscalSecretKind, SealedSecret } from "./local-envelope.js";
import { LocalFiscalVault } from "./local-envelope.js";

export { LocalFiscalVault, LocalKeyProvider, redactFiscalSecrets } from "./local-envelope.js";
export type { FiscalSecretKind, SealedSecret } from "./local-envelope.js";

/** Puerto de bóveda fiscal; en producción se implementa con KMS, en tests con `LocalFiscalVault`. */
export type FiscalCredentialVaultPort = {
  seal(tenantId: string, kind: FiscalSecretKind, plaintext: Buffer): SealedSecret;
  open(secret: SealedSecret): Buffer;
};

export function asFiscalCredentialVault(vault: LocalFiscalVault): FiscalCredentialVaultPort {
  return vault;
}