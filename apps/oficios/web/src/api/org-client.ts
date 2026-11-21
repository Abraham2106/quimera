import type { DevApiConfig } from "../config.js";
import { ApiRequestError } from "./client.js";

export const HVAC_TRADE_CONTRACT_ID = "hvac-refrigeration-v1";

export type RegisterOrganizationInput = {
  readonly commercialName: string;
  readonly legalName: string;
  readonly taxIdentification: string;
  readonly economicActivity: string;
  readonly tradeContractId: string;
  readonly slug: string;
};

export type MemberSummary = {
  readonly userSub: string;
  readonly role: "ADMIN" | "OPERATOR" | "AUDITOR_READONLY";
  readonly status: string;
  readonly createdAt: string;
};

function authHeaders(config: DevApiConfig, json = false): HeadersInit {
  const h: Record<string, string> = {};
  if (config.accessToken.trim()) {
    h.authorization = `Bearer ${config.accessToken.trim()}`;
  }
  if (json) {
    h["content-type"] = "application/json";
  }
  return h;
}

function bootstrapHeaders(config: DevApiConfig): HeadersInit {
  return {
    "content-type": "application/json",
    ...authHeaders(config),
  };
}

async function parseApiError(res: Response): Promise<ApiRequestError> {
  let body: { error?: { message?: string; code?: string } } | undefined;
  try {
    body = (await res.json()) as { error?: { message?: string; code?: string } };
  } catch {
    body = undefined;
  }
  return new ApiRequestError(
    body?.error?.message ?? "Solicitud fallida.",
    res.status,
    body?.error?.code,
  );
}

export async function registerOrganization(
  config: DevApiConfig,
  input: RegisterOrganizationInput,
): Promise<{ tenantId: string }> {
  const res = await fetch(`${config.apiBase}/api/v1/org/register`, {
    method: "POST",
    headers: bootstrapHeaders(config),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  const json = (await res.json()) as { organization: { tenantId: string } };
  return json.organization;
}

export async function fetchMembers(config: DevApiConfig): Promise<readonly MemberSummary[]> {
  const res = await fetch(`${config.apiBase}/api/v1/org/members`, {
    headers: authHeaders(config),
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  const json = (await res.json()) as { members: MemberSummary[] };
  return json.members;
}

export async function createInvitation(
  config: DevApiConfig,
  email: string,
  role: MemberSummary["role"],
): Promise<{ token: string; expiresAt: string }> {
  const res = await fetch(`${config.apiBase}/api/v1/invitations`, {
    method: "POST",
    headers: { ...authHeaders(config), "content-type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  const json = (await res.json()) as {
    invitation: { token: string; expiresAt: string };
  };
  return json.invitation;
}

export async function acceptInvitation(
  config: DevApiConfig,
  token: string,
): Promise<void> {
  const res = await fetch(`${config.apiBase}/api/v1/invitations/accept`, {
    method: "POST",
    headers: bootstrapHeaders(config),
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
}

export async function updateMemberRole(
  config: DevApiConfig,
  userSub: string,
  role: MemberSummary["role"],
): Promise<void> {
  const res = await fetch(
    `${config.apiBase}/api/v1/org/members/${encodeURIComponent(userSub)}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(config), "content-type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
}