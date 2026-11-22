import type { Sql } from "postgres";

import { withFobTenantTransaction } from "../db/connection.js";
import {
  loadSealedCredential,
  readIssuerActiveEnvironment,
  type FiscalCredentialEnvironment,
} from "../store/pg-fiscal-credentials.js";
import type { FiscalCredentialVaultPort, FiscalSecretKind } from "../vault/port.js";
import { zeroBuffers } from "../vault/secret-buffer.js";

export type DecryptedFiscalCredentials = {
  readonly issuerId: string;
  readonly environment: FiscalCredentialEnvironment;
  readonly p12: Buffer;
  readonly pin: string;
  readonly idpUsername: string;
  readonly idpPassword: string;
};

async function openKind(
  client: Sql,
  vault: FiscalCredentialVaultPort,
  tenantId: string,
  issuerId: string,
  environment: FiscalCredentialEnvironment,
  kind: FiscalSecretKind,
): Promise<Buffer> {
  const sealed = await loadSealedCredential(client, tenantId, issuerId, kind, environment);
  if (!sealed) {
    throw new Error(`ERR_FISCAL_CREDENTIALS: falta secreto ${kind} para emisor ${issuerId}`);
  }
  return vault.open(sealed);
}

export async function resolveWorkerIssuerId(client: Sql, tenantId: string): Promise<string> {
  const fromEnv = process.env.FISCAL_ISSUER_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const rows = await withFobTenantTransaction(client, tenantId, async (tx) =>
    tx<{ issuer_id: string }[]>`
      SELECT issuer_id
      FROM fob_fiscal_issuer_config
      ORDER BY promoted_at DESC NULLS LAST, issuer_id
      LIMIT 1
    `,
  );
  const issuerId = rows[0]?.issuer_id;
  if (!issuerId) {
    throw new Error("ERR_WORKER_ISSUER: configure FISCAL_ISSUER_ID o fob_fiscal_issuer_config");
  }
  return issuerId;
}

export async function loadDecryptedFiscalCredentials(
  client: Sql,
  vault: FiscalCredentialVaultPort,
  tenantId: string,
  issuerId: string,
  environment?: FiscalCredentialEnvironment,
): Promise<DecryptedFiscalCredentials> {
  const activeEnv =
    environment ??
    (await readIssuerActiveEnvironment(client, tenantId, issuerId)) ??
    "sandbox";

  const [p12, pin, idpUsername, idpPassword] = await Promise.all([
    openKind(client, vault, tenantId, issuerId, activeEnv, "p12"),
    openKind(client, vault, tenantId, issuerId, activeEnv, "pin"),
    openKind(client, vault, tenantId, issuerId, activeEnv, "idp_username"),
    openKind(client, vault, tenantId, issuerId, activeEnv, "idp_password"),
  ]);

  try {
    return {
      issuerId,
      environment: activeEnv,
      p12,
      pin: pin.toString("utf8"),
      idpUsername: idpUsername.toString("utf8"),
      idpPassword: idpPassword.toString("utf8"),
    };
  } finally {
    // El p12 se conserva porque el transporte lo usa para firmar; el resto se limpia.
    zeroBuffers(pin, idpUsername, idpPassword);
  }
}