import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type FiscalSecretKind = "p12" | "pin" | "idp_password";

export type SealedSecret = {
  readonly tenantId: string;
  readonly kind: FiscalSecretKind;
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly dekWrapped: string;
};

export type EnvelopeKeyProvider = {
  wrapDek(dek: Buffer): Buffer;
  unwrapDek(wrapped: Buffer): Buffer;
};

/** Local stand-in for a KMS. The data key is wrapped with a key that never leaves this process. */
export class LocalKeyProvider implements EnvelopeKeyProvider {
  constructor(private readonly kek: Buffer) {
    if (kek.byteLength !== 32) {
      throw new Error("ERR_VAULT_KEK: se requiere una KEK de 32 bytes");
    }
  }

  wrapDek(dek: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.kek, iv);
    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), wrapped]);
  }

  unwrapDek(payload: Buffer): Buffer {
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const wrapped = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(wrapped), decipher.final()]);
  }
}

export class LocalFiscalVault {
  constructor(private readonly keys: EnvelopeKeyProvider) {}

  seal(tenantId: string, kind: FiscalSecretKind, plaintext: Buffer): SealedSecret {
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      tenantId,
      kind,
      ciphertext: ciphertext.toString("base64url"),
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      dekWrapped: this.keys.wrapDek(dek).toString("base64url"),
    };
  }

  open(secret: SealedSecret): Buffer {
    const dek = this.keys.unwrapDek(Buffer.from(secret.dekWrapped, "base64url"));
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

export function redactFiscalSecrets(message: string): string {
  return message
    .replace(/pin["'\s:=]+[^\s"',]+/gi, "pin=[redacted]")
    .replace(/password["'\s:=]+[^\s"',]+/gi, "password=[redacted]");
}
