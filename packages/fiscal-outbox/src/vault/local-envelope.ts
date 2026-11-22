import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { zeroBuffer } from "./secret-buffer.js";

export type FiscalSecretKind = "p12" | "pin" | "idp_password" | "idp_username";
export type FiscalSecretEnvironment = "sandbox" | "production";

export const DEFAULT_KEK_ID = "v1";

export type SealedSecret = {
  readonly tenantId: string;
  readonly kind: FiscalSecretKind;
  readonly environment: FiscalSecretEnvironment;
  /** Versión de la KEK que envuelve la DEK; opcional en secretos legados. */
  readonly kekId?: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly dekWrapped: string;
};

export type EnvelopeKeyProvider = {
  readonly kekId: string;
  wrapDek(dek: Buffer): Buffer;
  unwrapDek(wrapped: Buffer, kekId?: string): Buffer;
};

/** AAD ligado al contexto del secreto: cualquier cambio deja de autenticar el GCM. */
export function fiscalSecretAad(
  tenantId: string,
  kind: FiscalSecretKind,
  environment: FiscalSecretEnvironment,
): Buffer {
  return Buffer.from(`${tenantId}|${kind}|${environment}`, "utf8");
}

function assertKekLength(kek: Buffer, kekId: string): void {
  if (kek.byteLength !== 32) {
    throw new Error(`ERR_VAULT_KEK: la KEK ${kekId} debe medir 32 bytes`);
  }
}

/** Local stand-in for a KMS. The data key is wrapped with a key that never leaves this process. */
export class LocalKeyProvider implements EnvelopeKeyProvider {
  readonly kekId: string;

  constructor(
    private readonly kek: Buffer,
    kekId: string = DEFAULT_KEK_ID,
  ) {
    assertKekLength(kek, kekId);
    this.kekId = kekId;
  }

  wrapDek(dek: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.kek, iv);
    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), wrapped]);
  }

  unwrapDek(payload: Buffer, kekId?: string): Buffer {
    if (kekId !== undefined && kekId !== this.kekId) {
      throw new Error(`ERR_VAULT_KEK_MISMATCH: no existe la KEK ${kekId}`);
    }
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const wrapped = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(wrapped), decipher.final()]);
  }
}

export type VersionedKek = {
  readonly kek: Buffer;
  readonly kekId: string;
};

/** Llavero local con KEK activa y versiones anteriores para rotación sin re-cifrado. */
export class LocalKeyRing implements EnvelopeKeyProvider {
  private readonly keys = new Map<string, Buffer>();
  private readonly activeId: string;

  constructor(active: VersionedKek, previous: readonly VersionedKek[] = []) {
    assertKekLength(active.kek, active.kekId);
    for (const candidate of previous) {
      assertKekLength(candidate.kek, candidate.kekId);
      if (candidate.kekId === active.kekId) {
        throw new Error("ERR_VAULT_KEK: ids de KEK duplicados");
      }
      this.keys.set(candidate.kekId, candidate.kek);
    }
    this.keys.set(active.kekId, active.kek);
    this.activeId = active.kekId;
  }

  get kekId(): string {
    return this.activeId;
  }

  wrapDek(dek: Buffer): Buffer {
    return new LocalKeyProvider(this.keys.get(this.activeId)!, this.activeId).wrapDek(dek);
  }

  unwrapDek(payload: Buffer, kekId?: string): Buffer {
    const ordered = kekId && this.keys.has(kekId)
      ? [kekId, ...[...this.keys.keys()].filter((id) => id !== kekId)]
      : [...this.keys.keys()];
    let lastError: unknown = new Error("ERR_VAULT_KEK_MISMATCH: llavero vacío");
    for (const id of ordered) {
      try {
        return new LocalKeyProvider(this.keys.get(id)!, id).unwrapDek(payload, id);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

export class LocalFiscalVault {
  constructor(private readonly keys: EnvelopeKeyProvider) {}

  seal(
    tenantId: string,
    kind: FiscalSecretKind,
    environment: FiscalSecretEnvironment,
    plaintext: Buffer,
  ): SealedSecret {
    const dek = randomBytes(32);
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", dek, iv);
      cipher.setAAD(fiscalSecretAad(tenantId, kind, environment));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const dekWrapped = this.keys.wrapDek(dek);
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

  open(secret: SealedSecret): Buffer {
    const dek = this.keys.unwrapDek(
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

export { redactFiscalSecrets } from "./redact.js";
