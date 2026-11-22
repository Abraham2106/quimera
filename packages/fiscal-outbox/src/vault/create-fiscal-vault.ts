import { createHash, randomBytes } from "node:crypto";

import { HttpFiscalVault } from "./http-fiscal-vault.js";
import { HttpKeyProvider } from "./http-key-provider.js";
import {
  DEFAULT_KEK_ID,
  LocalFiscalVault,
  LocalKeyProvider,
  LocalKeyRing,
  type EnvelopeKeyProvider,
  type VersionedKek,
} from "./local-envelope.js";
import type { FiscalCredentialVaultPort } from "./port.js";
import { asFiscalCredentialVault } from "./port.js";

export type FiscalVaultKind = "local" | "http";

export const TEST_KEK_ID = "test-v1";

const TEST_DEFAULT_KEK = createHash("sha256").update("quimera-fiscal-vault-test-kek").digest();

export function resolveFiscalVaultKind(): FiscalVaultKind {
  const explicit = process.env.FISCAL_VAULT?.trim().toLowerCase();
  if (explicit === "http" || explicit === "local") {
    return explicit;
  }
  return "local";
}

/** La KEK de prueba nunca se devuelve fuera de NODE_ENV=test. */
function testDefaultKek(): VersionedKek {
  if (process.env.NODE_ENV !== "test" || process.env.FISCAL_VAULT_ALLOW_TEST_KEK === "0") {
    throw new Error(
      "ERR_VAULT_KEK: TEST_DEFAULT_KEK sólo puede usarse con NODE_ENV=test; configure FISCAL_VAULT_LOCAL_KEK",
    );
  }
  return { kek: TEST_DEFAULT_KEK, kekId: TEST_KEK_ID };
}

function decodeKek(raw: string, envName: string): Buffer {
  const decoded = Buffer.from(raw, "base64url");
  if (decoded.byteLength !== 32) {
    throw new Error(`ERR_VAULT_KEK: ${envName} debe decodificar a 32 bytes`);
  }
  return decoded;
}

export function resolveLocalKek(): VersionedKek {
  const raw = process.env.FISCAL_VAULT_LOCAL_KEK?.trim();
  const configuredId = process.env.FISCAL_VAULT_LOCAL_KEK_ID?.trim();
  if (raw) {
    return {
      kek: decodeKek(raw, "FISCAL_VAULT_LOCAL_KEK"),
      kekId: configuredId || DEFAULT_KEK_ID,
    };
  }
  if (configuredId) {
    throw new Error("ERR_VAULT_KEK: FISCAL_VAULT_LOCAL_KEK_ID requiere FISCAL_VAULT_LOCAL_KEK");
  }
  return testDefaultKek();
}

function resolvePreviousLocalKeks(): VersionedKek[] {
  const raw = process.env.FISCAL_VAULT_LOCAL_KEK_PREVIOUS?.trim();
  if (!raw) {
    return [];
  }
  const kekId = process.env.FISCAL_VAULT_LOCAL_KEK_PREVIOUS_ID?.trim();
  if (!kekId) {
    throw new Error(
      "ERR_VAULT_KEK: FISCAL_VAULT_LOCAL_KEK_PREVIOUS requiere FISCAL_VAULT_LOCAL_KEK_PREVIOUS_ID",
    );
  }
  return [
    {
      kek: decodeKek(raw, "FISCAL_VAULT_LOCAL_KEK_PREVIOUS"),
      kekId,
    },
  ];
}

function createLocalKeyProvider(): EnvelopeKeyProvider {
  const active = resolveLocalKek();
  const previous = resolvePreviousLocalKeks();
  if (previous.length === 0) {
    return new LocalKeyProvider(active.kek, active.kekId);
  }
  return new LocalKeyRing(active, previous);
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
  const keys = options.keyProvider ?? createLocalKeyProvider();
  return asFiscalCredentialVault(new LocalFiscalVault(keys));
}

/** Sólo para pruebas que necesitan material envuelto reproducible. */
export function createEphemeralLocalVault(): {
  vault: FiscalCredentialVaultPort;
  kek: Buffer;
  kekId: string;
} {
  const kek = randomBytes(32);
  const kekId = "ephemeral-v1";
  return {
    vault: asFiscalCredentialVault(new LocalFiscalVault(new LocalKeyProvider(kek, kekId))),
    kek,
    kekId,
  };
}
