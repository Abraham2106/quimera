import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { EnvelopeKeyProvider } from "./local-envelope.js";

export type HttpKeyProviderOptions = {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
};

type WrapResponse = { readonly ciphertext: string };
type UnwrapResponse = { readonly plaintext: string };

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function resolveUrl(baseUrl: string, path: string): URL {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), base);
}

/** Adaptador HTTP hacia un endpoint KMS/Vault configurable (envelope DEK). */
export class HttpKeyProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpKeyProviderOptions) {
    if (!options.baseUrl.trim() || !options.token.trim()) {
      throw new Error("ERR_VAULT_HTTP: FISCAL_VAULT_URL y FISCAL_VAULT_TOKEN son obligatorios");
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async wrapDekAsync(dek: Buffer): Promise<Buffer> {
    const value = await this.postField("/v1/wrap", { plaintext: dek.toString("base64url") }, "ciphertext");
    return Buffer.from(value, "base64url");
  }

  async unwrapDekAsync(payload: Buffer): Promise<Buffer> {
    const value = await this.postField(
      "/v1/unwrap",
      { ciphertext: payload.toString("base64url") },
      "plaintext",
    );
    return Buffer.from(value, "base64url");
  }

  private async postField(
    path: string,
    body: Record<string, string>,
    field: "ciphertext" | "plaintext",
  ): Promise<string> {
    const url = resolveUrl(this.options.baseUrl, path);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: authHeaders(this.options.token),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`ERR_VAULT_HTTP: ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const value = json[field];
    if (typeof value !== "string" || !value) {
      throw new Error("ERR_VAULT_HTTP: respuesta inválida");
    }
    return value;
  }
}

/** Proveedor síncrono directo sobre handlers loopback (pruebas sin red). */
export class LoopbackHttpKeyProvider implements EnvelopeKeyProvider {
  constructor(
    private readonly handlers: ReturnType<typeof createLoopbackVaultHttpHandlers>,
  ) {}

  wrapDek(dek: Buffer): Buffer {
    return Buffer.from(
      this.handlers.wrap({ plaintext: dek.toString("base64url") }).ciphertext,
      "base64url",
    );
  }

  unwrapDek(payload: Buffer): Buffer {
    return Buffer.from(
      this.handlers.unwrap({ ciphertext: payload.toString("base64url") }).plaintext,
      "base64url",
    );
  }
}

/** Stub loopback para pruebas: replica envelope AES-256-GCM con KEK fija en memoria. */
export function createLoopbackVaultHttpHandlers(kek: Buffer): {
  wrap: (body: { plaintext: string }) => { ciphertext: string };
  unwrap: (body: { ciphertext: string }) => { plaintext: string };
} {
  if (kek.byteLength !== 32) {
    throw new Error("ERR_VAULT_KEK: se requiere una KEK de 32 bytes");
  }
  return {
    wrap(body) {
      const plain = Buffer.from(body.plaintext, "base64url");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", kek, iv);
      const wrapped = Buffer.concat([cipher.update(plain), cipher.final()]);
      const payload = Buffer.concat([iv, cipher.getAuthTag(), wrapped]);
      return { ciphertext: payload.toString("base64url") };
    },
    unwrap(body) {
      const payload = Buffer.from(body.ciphertext, "base64url");
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const wrapped = payload.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", kek, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(wrapped), decipher.final()]);
      return { plaintext: plain.toString("base64url") };
    },
  };
}