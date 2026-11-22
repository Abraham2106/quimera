import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { DEFAULT_KEK_ID, type EnvelopeKeyProvider } from "./local-envelope.js";

export type HttpKeyProviderOptions = {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly kekId?: string;
};

export const DEFAULT_VAULT_HTTP_TIMEOUT_MS = 5_000;

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

/** Sólo HTTPS, con excepción explícita de loopback en pruebas. */
export function resolveSecureVaultUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ERR_VAULT_HTTP: FISCAL_VAULT_URL no es una URL válida");
  }
  if (url.username || url.password) {
    throw new Error("ERR_VAULT_HTTP: la URL del vault no debe incluir credenciales");
  }
  const isSecure = url.protocol === "https:";
  const isTestLoopback =
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    process.env.NODE_ENV === "test";
  if (!isSecure && !isTestLoopback) {
    throw new Error("ERR_VAULT_HTTP: se requiere HTTPS (sólo http://127.0.0.1 permitido en test)");
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}

function resolveUrl(base: URL, path: string): URL {
  return new URL(path.replace(/^\//, ""), base);
}

/** Adaptador HTTP hacia un endpoint KMS/Vault configurable (envelope DEK). */
export class HttpKeyProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: URL;
  readonly kekId: string;

  constructor(private readonly options: HttpKeyProviderOptions) {
    if (!options.baseUrl.trim() || !options.token.trim()) {
      throw new Error("ERR_VAULT_HTTP: FISCAL_VAULT_URL y FISCAL_VAULT_TOKEN son obligatorios");
    }
    this.baseUrl = resolveSecureVaultUrl(options.baseUrl.trim());
    this.kekId = options.kekId?.trim() || DEFAULT_KEK_ID;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async wrapDekAsync(dek: Buffer): Promise<Buffer> {
    const value = await this.postField("/v1/wrap", { plaintext: dek.toString("base64url") }, "ciphertext");
    return Buffer.from(value, "base64url");
  }

  async unwrapDekAsync(payload: Buffer, kekId?: string): Promise<Buffer> {
    // El KMS remoto resuelve la versión de KEK; aquí sólo se registra el hint.
    void kekId;
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
    const url = resolveUrl(this.baseUrl, path);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: authHeaders(this.options.token),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_VAULT_HTTP_TIMEOUT_MS),
      });
    } catch {
      // Nunca propagar la URL ni el token del proveedor en el error.
      throw new Error("ERR_VAULT_HTTP: falló la solicitud al proveedor de claves");
    }
    if (!res.ok) {
      throw new Error(`ERR_VAULT_HTTP: ${res.status}`);
    }
    let json: Record<string, unknown>;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new Error("ERR_VAULT_HTTP: respuesta inválida");
    }
    const value = json[field];
    if (typeof value !== "string" || !value) {
      throw new Error("ERR_VAULT_HTTP: respuesta inválida");
    }
    return value;
  }
}

/** Proveedor síncrono directo sobre handlers loopback (pruebas sin red). */
export class LoopbackHttpKeyProvider implements EnvelopeKeyProvider {
  readonly kekId = "http-loopback";

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
