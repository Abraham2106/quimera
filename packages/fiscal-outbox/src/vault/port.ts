import type { FiscalSecretKind, SealedSecret } from "./local-envelope.js";
import { LocalFiscalVault } from "./local-envelope.js";

export { LocalFiscalVault, LocalKeyProvider, redactFiscalSecrets } from "./local-envelope.js";
export type { FiscalSecretKind, SealedSecret } from "./local-envelope.js";

/** Puerto de bóveda fiscal; en producción se implementa con KMS HTTP, en tests con `LocalFiscalVault`. */
export type FiscalCredentialVaultPort = {
  seal(tenantId: string, kind: FiscalSecretKind, plaintext: Buffer): Promise<SealedSecret>;
  open(secret: SealedSecret): Promise<Buffer>;
};

export function asFiscalCredentialVault(vault: LocalFiscalVault): FiscalCredentialVaultPort {
  return {
    seal(tenantId, kind, plaintext) {
      return Promise.resolve(vault.seal(tenantId, kind, plaintext));
    },
    open(secret) {
      return Promise.resolve(vault.open(secret));
    },
  };
}