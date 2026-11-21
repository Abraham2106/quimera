import { z } from "zod";

export const SAAS_MEMBERSHIP_ROLES = ["ADMIN", "OPERATOR", "AUDITOR_READONLY"] as const;
export type SaasMembershipRole = (typeof SAAS_MEMBERSHIP_ROLES)[number];

export const SAAS_ORG_STATUSES = ["active", "suspended", "offboarding"] as const;
export type SaasOrgStatus = (typeof SAAS_ORG_STATUSES)[number];

export const RegisterOrganizationBodySchema = z.object({
  commercialName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(300),
  taxIdentification: z.string().trim().min(1).max(40),
  economicActivity: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Actividad económica de 6 dígitos requerida."),
  tradeContractId: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug en minúsculas con guiones."),
  timezone: z.string().trim().min(1).max(64).default("America/Costa_Rica"),
});

export type RegisterOrganizationBody = z.infer<typeof RegisterOrganizationBodySchema>;

export const CreateInvitationBodySchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(SAAS_MEMBERSHIP_ROLES),
  expiresInHours: z.number().int().min(1).max(720).optional(),
});

export type CreateInvitationBody = z.infer<typeof CreateInvitationBodySchema>;

export const AcceptInvitationBodySchema = z.object({
  token: z.string().trim().min(16).max(256),
});

export type AcceptInvitationBody = z.infer<typeof AcceptInvitationBodySchema>;

export const UpdateMemberRoleBodySchema = z.object({
  role: z.enum(SAAS_MEMBERSHIP_ROLES),
});

export type UpdateMemberRoleBody = z.infer<typeof UpdateMemberRoleBodySchema>;