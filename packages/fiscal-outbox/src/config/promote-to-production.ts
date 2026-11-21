import { assertCanPromoteToProduction } from "../vault/certificate-policy.js";
import type { FiscalEnvironment } from "../store/types.js";
import { type FobSql, withFobTenantTransaction } from "../db/connection.js";

/** `staging` en el esquema actual equivale al sandbox de Hacienda (QG-07). */
export function isSandboxEnvironment(environment: FiscalEnvironment): boolean {
  return environment === "staging" || environment === "mock";
}

export type PromoteToProductionInput = {
  readonly tenantId: string;
  readonly issuerId: string;
  readonly productionCertificateValid: boolean;
  readonly adminConfirmed: boolean;
};

export type PromoteToProductionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export async function evaluatePromoteToProduction(
  client: FobSql,
  input: PromoteToProductionInput,
): Promise<PromoteToProductionResult> {
  const sandboxAccepted = await withFobTenantTransaction(client, input.tenantId, async (tx) => {
    const rows = await tx<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM fob_fiscal_documents AS d
      INNER JOIN fob_fiscal_intents AS i ON i.id = d.intent_id
      WHERE d.tenant_id = ${input.tenantId}::uuid
        AND i.issuer_id = ${input.issuerId}
        AND i.environment IN ('staging', 'mock')
        AND d.delivery_state = 'ACEPTADO'
    `;
    return Number(rows[0]?.count ?? "0") > 0;
  });

  return assertCanPromoteToProduction({
    sandboxAccepted,
    productionCertificateValid: input.productionCertificateValid,
    adminConfirmed: input.adminConfirmed,
  });
}