import type {
  FiscalSecretEnvironment,
  FiscalSecretKind,
  SealedSecret,
} from "./local-envelope.js";
import { LocalFiscalVault } from "./local-envelope.js";

export { LocalFiscalVault, LocalKeyProvider, LocalKeyRing } from "./local-envelope.js";
export { redactFiscalSecrets } from "./redact.js";
export {
  redactFiscalObject,
  redactFiscalLog,
  FISCAL_REDACTED,
} from "./redact.js";
export type {
  FiscalSecretKind,
  FiscalSecretEnvironment,
  SealedSecret,
} from "./local-envelope.js";

/** Puerto de bóveda fiscal; en producción se implementa con KMS HTTP, en tests con `LocalFiscalVault`. */
export type FiscalCredentialVaultPort = {
  seal(
    tenantId: string,
    kind: FiscalSecretKind,
    environment: FiscalSecretEnvironment,
    plaintext: Buffer,
  ): Promise<SealedSecret>;
  open(secret: SealedSecret): Promise<Buffer>;
};

export function asFiscalCredentialVault(vault: LocalFiscalVault): FiscalCredentialVaultPort {
  return {
    seal(tenantId, kind, environment, plaintext) {
      return Promise.resolve(vault.seal(tenantId, kind, environment, plaintext));
    },
    open(secret) {
      return Promise.resolve(vault.open(secret));
    },
  };
}
