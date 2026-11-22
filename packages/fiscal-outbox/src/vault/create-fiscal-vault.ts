import { createHash, randomBytes } from "node:crypto";

import { HttpFiscalVault } from "./http-fiscal-vault.js";
import { HttpKeyProvider } from "./http-key-provider.js";
import {
  LocalFiscalVault,
  LocalKeyProvider,
  type EnvelopeKeyProvider,
} from "./local-envelope.js";
import type { FiscalCredentialVaultPort } from "./port.js";
import { asFiscalCredentialVault } from "./port.js";

export type FiscalVaultKind = "local" | "http";

const TEST_DEFAULT_KEK = createHash("sha256").update("quimera-fiscal-vault-test-kek").digest();

export function resolveFiscalVaultKind(): FiscalVaultKind {
  const explicit = process.env.FISCAL_VAULT?.trim().toLowerCase();
  if (explicit === "http" || explicit === "local") {
    return explicit;
  }
  return "local";
}

function resolveLocalKek(): Buffer {
  const raw = process.env.FISCAL_VAULT_LOCAL_KEK?.trim();
  if (raw) {
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.byteLength !== 32) {
      throw new Error("ERR_VAULT_KEK: FISCAL_VAULT_LOCAL_KEK debe decodificar a 32 bytes");
    }
    return decoded;
  }
  if (process.env.NODE_ENV === "test") {
    return TEST_DEFAULT_KEK;
  }
  throw new Error("ERR_VAULT_KEK: configure FISCAL_VAULT_LOCAL_KEK para FISCAL_VAULT=local");
}

export type CreateFiscalCredentialVaultOptions = {
  readonly kind?: FiscalVaultKind;
  readonly keyProvider?: EnvelopeKeyProvider;
  readonly httpKeyProvider?: HttpKeyProvider;
  readonly fetchImpl?: typeof fetch;
};

export function createFiscalCredentialVault(
  options: CreateFiscalCredentialVaultOptions = {},
): FiscalCredentialVaultPort {
  const kind = options.kind ?? resolveFiscalVaultKind();
  if (kind === "http") {
    const httpKeys =
      options.httpKeyProvider ??
      new HttpKeyProvider({
        baseUrl: process.env.FISCAL_VAULT_URL?.trim() ?? "",
        token: process.env.FISCAL_VAULT_TOKEN?.trim() ?? "",
        fetchImpl: options.fetchImpl,
      });
    return new HttpFiscalVault(httpKeys);
  }
  const keys = options.keyProvider ?? new LocalKeyProvider(resolveLocalKek());
  return asFiscalCredentialVault(new LocalFiscalVault(keys));
}

/** Sólo para pruebas que necesitan material envuelto reproducible. */
export function createEphemeralLocalVault(): { vault: FiscalCredentialVaultPort; kek: Buffer } {
  const kek = randomBytes(32);
  return { vault: asFiscalCredentialVault(new LocalFiscalVault(new LocalKeyProvider(kek))), kek };
}