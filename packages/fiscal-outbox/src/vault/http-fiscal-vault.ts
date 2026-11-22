import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { HttpKeyProvider } from "./http-key-provider.js";
import {
  fiscalSecretAad,
  type FiscalSecretEnvironment,
  type FiscalSecretKind,
  type SealedSecret,
} from "./local-envelope.js";
import type { FiscalCredentialVaultPort } from "./port.js";
import { zeroBuffer } from "./secret-buffer.js";

export class HttpFiscalVault implements FiscalCredentialVaultPort {
  constructor(private readonly keys: HttpKeyProvider) {}

  async seal(
    tenantId: string,
    kind: FiscalSecretKind,
    environment: FiscalSecretEnvironment,
    plaintext: Buffer,
  ): Promise<SealedSecret> {
    const dek = randomBytes(32);
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", dek, iv);
      cipher.setAAD(fiscalSecretAad(tenantId, kind, environment));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const dekWrapped = await this.keys.wrapDekAsync(dek);
      return {
        tenantId,
        kind,
        environment,
        kekId: this.keys.kekId,
        ciphertext: ciphertext.toString("base64url"),
        iv: iv.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
        dekWrapped: dekWrapped.toString("base64url"),
      };
    } finally {
      zeroBuffer(dek);
    }
  }

  async open(secret: SealedSecret): Promise<Buffer> {
    const dek = await this.keys.unwrapDekAsync(
      Buffer.from(secret.dekWrapped, "base64url"),
      secret.kekId,
    );
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        dek,
        Buffer.from(secret.iv, "base64url"),
      );
      decipher.setAAD(fiscalSecretAad(secret.tenantId, secret.kind, secret.environment));
      decipher.setAuthTag(Buffer.from(secret.tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(secret.ciphertext, "base64url")),
        decipher.final(),
      ]);
    } finally {
      zeroBuffer(dek);
    }
  }
}
