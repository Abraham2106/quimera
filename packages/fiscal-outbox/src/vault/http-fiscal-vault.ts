import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { HttpKeyProvider } from "./http-key-provider.js";
import type { FiscalSecretKind, SealedSecret } from "./local-envelope.js";
import type { FiscalCredentialVaultPort } from "./port.js";

export class HttpFiscalVault implements FiscalCredentialVaultPort {
  constructor(private readonly keys: HttpKeyProvider) {}

  async seal(tenantId: string, kind: FiscalSecretKind, plaintext: Buffer): Promise<SealedSecret> {
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const dekWrapped = await this.keys.wrapDekAsync(dek);
    return {
      tenantId,
      kind,
      ciphertext: ciphertext.toString("base64url"),
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      dekWrapped: dekWrapped.toString("base64url"),
    };
  }

  async open(secret: SealedSecret): Promise<Buffer> {
    const dek = await this.keys.unwrapDekAsync(Buffer.from(secret.dekWrapped, "base64url"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      dek,
      Buffer.from(secret.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(secret.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64url")),
      decipher.final(),
    ]);
  }
}