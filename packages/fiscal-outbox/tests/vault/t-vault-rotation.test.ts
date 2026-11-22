import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEphemeralLocalVault,
  createFiscalCredentialVault,
  resolveLocalKek,
  TEST_KEK_ID,
} from "../../src/vault/create-fiscal-vault.js";
import {
  HttpKeyProvider,
  resolveSecureVaultUrl,
} from "../../src/vault/http-key-provider.js";
import {
  LocalFiscalVault,
  LocalKeyProvider,
  LocalKeyRing,
} from "../../src/vault/local-envelope.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PLAIN = Buffer.from("secreto-rotado");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("T-SEC-FOB-KEK — versión y rotación", () => {
  it("registra el kekId en el secreto envuelto", () => {
    const vault = new LocalFiscalVault(new LocalKeyProvider(randomBytes(32), "kek-2026-11"));
    const sealed = vault.seal(TENANT, "pin", "sandbox", PLAIN);
    expect(sealed.kekId).toBe("kek-2026-11");
  });

  it("el llavero abre secretos de la KEK anterior y sella con la activa", () => {
    const oldKek = randomBytes(32);
    const newKek = randomBytes(32);
    const oldVault = new LocalFiscalVault(new LocalKeyProvider(oldKek, "kek-v1"));
    const oldSealed = oldVault.seal(TENANT, "idp_password", "sandbox", PLAIN);

    const rotating = new LocalKeyRing(
      { kek: newKek, kekId: "kek-v2" },
      [{ kek: oldKek, kekId: "kek-v1" }],
    );
    const rotatingVault = new LocalFiscalVault(rotating);
    expect(rotatingVault.open(oldSealed).equals(PLAIN)).toBe(true);
    expect(rotatingVault.seal(TENANT, "idp_password", "sandbox", PLAIN).kekId).toBe("kek-v2");
    expect(() =>
      rotatingVault.open({ ...oldSealed, kekId: "kek-desconocida" }),
    ).not.toThrow();
  });

  it("la factory rota con las variables de entorno versionadas", async () => {
    const oldKek = randomBytes(32);
    const newKek = randomBytes(32);
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK", oldKek.toString("base64url"));
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK_ID", "kek-v1");
    const before = createFiscalCredentialVault();
    const sealed = await before.seal(TENANT, "p12", "sandbox", PLAIN);

    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK", newKek.toString("base64url"));
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK_ID", "kek-v2");
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK_PREVIOUS", oldKek.toString("base64url"));
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK_PREVIOUS_ID", "kek-v1");
    const after = createFiscalCredentialVault();

    expect((await after.open(sealed)).equals(PLAIN)).toBe(true);
    const resealed = await after.seal(TENANT, "p12", "sandbox", PLAIN);
    expect(resealed.kekId).toBe("kek-v2");
  });

  it("TEST_DEFAULT_KEK falla cerrado fuera de NODE_ENV=test", () => {
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK", "");
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK_ID", "");
    expect(resolveLocalKek().kekId).toBe(TEST_KEK_ID);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveLocalKek()).toThrow(/TEST_DEFAULT_KEK/);
  });

  it("exige KEK de 32 bytes y coherencia del id", () => {
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK", Buffer.from("corta").toString("base64url"));
    expect(() => resolveLocalKek()).toThrow(/32 bytes/);
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK", randomBytes(32).toString("base64url"));
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK_ID", "kek-v3");
    expect(resolveLocalKek().kekId).toBe("kek-v3");
    vi.stubEnv("FISCAL_VAULT_LOCAL_KEK", "");
    expect(() => resolveLocalKek()).toThrow(/requiere FISCAL_VAULT_LOCAL_KEK/);
  });

  it("usa un llavero reproducible en createEphemeralLocalVault", async () => {
    const { vault, kekId } = createEphemeralLocalVault();
    const sealed = await vault.seal(TENANT, "pin", "sandbox", PLAIN);
    expect(sealed.kekId).toBe(kekId);
  });

  it("limpia la DEK temporal tras sellar (no queda en el buffer)", () => {
    let captured: Buffer | undefined;
    const provider = {
      kekId: "spy-v1",
      wrapDek: (dek: Buffer) => {
        expect(dek.equals(Buffer.alloc(32))).toBe(false);
        captured = dek;
        return Buffer.concat([randomBytes(28), dek]);
      },
      unwrapDek: (payload: Buffer) => payload.subarray(28),
    };
    const vault = new LocalFiscalVault(provider);
    vault.seal(TENANT, "pin", "sandbox", PLAIN);
    expect(captured?.equals(Buffer.alloc(32))).toBe(true);
  });
});

describe("T-SEC-FOB-HTTP-KEYS", () => {
  it("exige HTTPS salvo 127.0.0.1 en test", () => {
    expect(() => resolveSecureVaultUrl("http://kms.example.com")).toThrow(/HTTPS/);
    expect(() => resolveSecureVaultUrl("https://kms.example.com/v1/")).not.toThrow();
    expect(() => resolveSecureVaultUrl("http://127.0.0.1:1234")).not.toThrow();
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveSecureVaultUrl("http://127.0.0.1:1234")).toThrow(/HTTPS/);
  });

  it("rechaza credenciales incrustadas en la URL", () => {
    expect(() => resolveSecureVaultUrl("https://user:pass@kms.example.com")).toThrow(
      /credenciales/,
    );
  });

  it("no filtra el token en errores y aplica timeout", async () => {
    const token = "SUPER_SECRET_TOKEN";
    const seen: RequestInit[] = [];
    const provider = new HttpKeyProvider({
      baseUrl: "https://kms.example.com",
      token,
      timeoutMs: 250,
      fetchImpl: async (_url, init) => {
        seen.push(init);
        throw new Error(`boom ${token}`);
      },
    });
    let message = "";
    try {
      await provider.wrapDekAsync(randomBytes(32));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/ERR_VAULT_HTTP/);
    expect(message).not.toContain(token);
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("envía la clave envuelta y valida el campo de respuesta", async () => {
    const provider = new HttpKeyProvider({
      baseUrl: "https://kms.example.com",
      token: "token",
      fetchImpl: async (url, init) => {
        expect(String(url)).toMatch(/\/v1\/wrap$/);
        const body = JSON.parse(String(init.body)) as { plaintext: string };
        expect(body.plaintext).toBeTruthy();
        return new Response(JSON.stringify({ ciphertext: body.plaintext }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const dek = randomBytes(32);
    const wrapped = await provider.wrapDekAsync(dek);
    expect(wrapped.equals(dek)).toBe(true);
  });
});
