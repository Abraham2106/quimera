import type { FiscalCredentialVaultPort, FiscalSecretKind, SealedSecret } from "../vault/port.js";
import { zeroBuffer } from "../vault/secret-buffer.js";
import { type FobSql, withFobTenantTransaction } from "../db/connection.js";

export type FiscalCredentialEnvironment = "sandbox" | "production";

export type StoredFiscalCredentialMeta = {
  readonly issuerId: string;
  readonly environment: FiscalCredentialEnvironment;
  readonly kind: FiscalSecretKind;
  readonly certNotAfter: Date | null;
  readonly updatedAt: Date;
};

type CredentialRow = {
  issuer_id: string;
  environment: FiscalCredentialEnvironment;
  kind: FiscalSecretKind;
  ciphertext: string;
  iv: string;
  tag: string;
  dek_wrapped: string;
  cert_not_after: Date | null;
  updated_at: Date;
};

export type FiscalCredentialUploadInput = {
  readonly tenantId: string;
  readonly issuerId: string;
  readonly environment: FiscalCredentialEnvironment;
  readonly p12: Buffer;
  readonly pin: string;
  readonly idpUsername: string;
  readonly idpPassword: string;
  readonly certNotAfter: Date;
};

export type FiscalCredentialUploadResult = {
  readonly ok: true;
  readonly issuerId: string;
  readonly environment: FiscalCredentialEnvironment;
  readonly certNotAfter: string;
  readonly expiresWithin30Days: boolean;
};

export async function upsertFiscalCredentials(
  client: FobSql,
  vault: FiscalCredentialVaultPort,
  input: FiscalCredentialUploadInput,
): Promise<FiscalCredentialUploadResult> {
  const pieces: Array<{
    kind: FiscalSecretKind;
    plain: Buffer;
    certNotAfter: Date | null;
    owned: boolean;
  }> = [
    { kind: "p12", plain: input.p12, certNotAfter: input.certNotAfter, owned: false },
    { kind: "pin", plain: Buffer.from(input.pin, "utf8"), certNotAfter: null, owned: true },
    {
      kind: "idp_username",
      plain: Buffer.from(input.idpUsername, "utf8"),
      certNotAfter: null,
      owned: true,
    },
    {
      kind: "idp_password",
      plain: Buffer.from(input.idpPassword, "utf8"),
      certNotAfter: null,
      owned: true,
    },
  ];

  await withFobTenantTransaction(client, input.tenantId, async (tx) => {
    for (const piece of pieces) {
      let sealed: SealedSecret;
      try {
        sealed = await vault.seal(input.tenantId, piece.kind, input.environment, piece.plain);
      } finally {
        if (piece.owned) {
          zeroBuffer(piece.plain);
        }
      }
      await tx`
        INSERT INTO fob_fiscal_credentials (
          tenant_id,
          issuer_id,
          kind,
          environment,
          ciphertext,
          iv,
          tag,
          dek_wrapped,
          cert_not_after
        )
        VALUES (
          ${input.tenantId}::uuid,
          ${input.issuerId},
          ${piece.kind},
          ${input.environment},
          ${sealed.ciphertext},
          ${sealed.iv},
          ${sealed.tag},
          ${sealed.dekWrapped},
          ${piece.certNotAfter}
        )
        ON CONFLICT (tenant_id, issuer_id, kind, environment) DO UPDATE SET
          ciphertext = EXCLUDED.ciphertext,
          iv = EXCLUDED.iv,
          tag = EXCLUDED.tag,
          dek_wrapped = EXCLUDED.dek_wrapped,
          cert_not_after = EXCLUDED.cert_not_after,
          updated_at = now()
      `;
    }
    await tx`
      INSERT INTO fob_fiscal_issuer_config (tenant_id, issuer_id, active_environment)
      VALUES (${input.tenantId}::uuid, ${input.issuerId}, ${input.environment})
      ON CONFLICT (tenant_id, issuer_id) DO NOTHING
    `;
  });

  const now = new Date();
  const expiresWithin30Days =
    input.certNotAfter.getTime() - now.getTime() <= 30 * 24 * 60 * 60 * 1000;

  return {
    ok: true,
    issuerId: input.issuerId,
    environment: input.environment,
    certNotAfter: input.certNotAfter.toISOString(),
    expiresWithin30Days,
  };
}

export async function listFiscalCredentialMetadata(
  client: FobSql,
  tenantId: string,
): Promise<StoredFiscalCredentialMeta[]> {
  return withFobTenantTransaction(client, tenantId, async (tx) => {
    const rows = await tx<CredentialRow[]>`
      SELECT issuer_id, environment, kind, cert_not_after, updated_at
      FROM fob_fiscal_credentials
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY issuer_id, environment, kind
    `;
    return rows.map((row) => ({
      issuerId: row.issuer_id,
      environment: row.environment,
      kind: row.kind,
      certNotAfter: row.cert_not_after,
      updatedAt: row.updated_at,
    }));
  });
}

export async function loadSealedCredential(
  client: FobSql,
  tenantId: string,
  issuerId: string,
  kind: FiscalSecretKind,
  environment: FiscalCredentialEnvironment,
): Promise<SealedSecret | null> {
  return withFobTenantTransaction(client, tenantId, async (tx) => {
    const rows = await tx<CredentialRow[]>`
      SELECT issuer_id, environment, kind, ciphertext, iv, tag, dek_wrapped, cert_not_after, updated_at
      FROM fob_fiscal_credentials
      WHERE tenant_id = ${tenantId}::uuid
        AND issuer_id = ${issuerId}
        AND kind = ${kind}
        AND environment = ${environment}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      tenantId,
      kind: row.kind,
      environment: row.environment,
      ciphertext: row.ciphertext,
      iv: row.iv,
      tag: row.tag,
      dekWrapped: row.dek_wrapped,
    };
  });
}

export async function productionCertificateIsValid(
  client: FobSql,
  tenantId: string,
  issuerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return withFobTenantTransaction(client, tenantId, async (tx) => {
    const rows = await tx<{ cert_not_after: Date | null }[]>`
      SELECT cert_not_after
      FROM fob_fiscal_credentials
      WHERE tenant_id = ${tenantId}::uuid
        AND issuer_id = ${issuerId}
        AND kind = 'p12'
        AND environment = 'production'
      LIMIT 1
    `;
    const notAfter = rows[0]?.cert_not_after;
    return Boolean(notAfter && notAfter.getTime() > now.getTime());
  });
}

export async function promoteIssuerToProduction(
  client: FobSql,
  tenantId: string,
  issuerId: string,
): Promise<void> {
  await withFobTenantTransaction(client, tenantId, async (tx) => {
    await tx`
      INSERT INTO fob_fiscal_issuer_config (tenant_id, issuer_id, active_environment, promoted_at)
      VALUES (${tenantId}::uuid, ${issuerId}, 'production', now())
      ON CONFLICT (tenant_id, issuer_id) DO UPDATE SET
        active_environment = 'production',
        promoted_at = now()
    `;
  });
}

export async function readIssuerActiveEnvironment(
  client: FobSql,
  tenantId: string,
  issuerId: string,
): Promise<FiscalCredentialEnvironment | null> {
  return withFobTenantTransaction(client, tenantId, async (tx) => {
    const rows = await tx<{ active_environment: FiscalCredentialEnvironment }[]>`
      SELECT active_environment
      FROM fob_fiscal_issuer_config
      WHERE tenant_id = ${tenantId}::uuid
        AND issuer_id = ${issuerId}
      LIMIT 1
    `;
    return rows[0]?.active_environment ?? null;
  });
}