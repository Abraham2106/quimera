import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  LocalFiscalVault,
  LocalKeyProvider,
  type SealedSecret,
} from "../../src/vault/local-envelope.js";
import { HttpFiscalVault } from "../../src/vault/http-fiscal-vault.js";
import {
  createLoopbackVaultHttpHandlers,
  LoopbackHttpKeyProvider,
  type HttpKeyProvider,
} from "../../src/vault/http-key-provider.js";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const PLAIN = Buffer.from("secreto-fiscal");

describe("T-SEC-FOB-VAULT — AAD tenantId|kind|environment", () => {
  const vault = new LocalFiscalVault(new LocalKeyProvider(randomBytes(32), "tamper-v1"));
  const sealed = vault.seal(TENANT_A, "pin", "sandbox", PLAIN);

  it("abre con el contexto original", () => {
    expect(vault.open(sealed).equals(PLAIN)).toBe(true);
    expect(sealed.kekId).toBe("tamper-v1");
    expect(sealed.environment).toBe("sandbox");
  });

  it("rechaza un tenant distinto", () => {
    expect(() => vault.open({ ...sealed, tenantId: TENANT_B })).toThrow();
  });

  it("rechaza un kind distinto", () => {
    expect(() => vault.open({ ...sealed, kind: "p12" })).toThrow();
  });

  it("rechaza un environment distinto", () => {
    expect(() => vault.open({ ...sealed, environment: "production" })).toThrow();
  });

  it("rechaza ciphertext, tag o IV alterados", () => {
    const corruptedCiphertext = Buffer.from(sealed.ciphertext, "base64url");
    corruptedCiphertext[0] ^= 1;
    const flipped: SealedSecret = {
      ...sealed,
      ciphertext: corruptedCiphertext.toString("base64url"),
    };
    expect(() => vault.open(flipped)).toThrow();
    expect(() => vault.open({ ...sealed, tag: randomBytes(16).toString("base64url") })).toThrow();
    expect(() => vault.open({ ...sealed, iv: randomBytes(12).toString("base64url") })).toThrow();
  });

  it("aplica el mismo AAD en HttpFiscalVault", async () => {
    const handlers = createLoopbackVaultHttpHandlers(randomBytes(32));
    const loopback = new LoopbackHttpKeyProvider(handlers);
    const keys = {
      kekId: loopback.kekId,
      wrapDekAsync: (dek: Buffer) => Promise.resolve(loopback.wrapDek(dek)),
      unwrapDekAsync: (payload: Buffer) => Promise.resolve(loopback.unwrapDek(payload)),
    } as unknown as HttpKeyProvider;
    const httpVault = new HttpFiscalVault(keys);
    const httpSealed = await httpVault.seal(TENANT_A, "idp_password", "production", PLAIN);
    expect((await httpVault.open(httpSealed)).equals(PLAIN)).toBe(true);
    await expect(httpVault.open({ ...httpSealed, environment: "sandbox" })).rejects.toThrow();
  });
});
