import { SemVerSchema } from "@quimera/core";
import { z } from "../vendor/zod.js";

const JsonSchemaNodeSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z
    .object({
      type: z.string().optional(),
      required: z.array(z.string()).optional(),
      properties: z.record(z.string(), JsonSchemaNodeSchema).optional(),
      items: JsonSchemaNodeSchema.optional(),
      pattern: z.string().optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .passthrough(),
);

const QueryParamSchema = z
  .object({
    type: z.enum(["string", "integer", "number", "boolean"]),
    required: z.boolean().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict();

const ResponseSpecSchema = z.union([
  z
    .object({
      contentType: z.string().optional(),
      schema: JsonSchemaNodeSchema.optional(),
    })
    .strict(),
  z
    .object({
      mappedError: z.string().regex(/^ERR_[A-Z0-9_]+$/),
    })
    .strict(),
]);

export const ApiPassportSchema = z
  .object({
    passportId: z.string().regex(/^cr\.[a-z0-9_.]+$/),
    passportVersion: SemVerSchema,
    status: z.enum(["ACTIVE", "DEPRECATED", "INFORMATIONAL"]),
    country: z.literal("CR").optional(),
    executable: z.boolean().default(true),
    accessTier: z
      .enum([
        "public",
        "public_ogc",
        "private_contract_required",
        "bearer_token",
      ])
      .optional(),
    provider: z
      .object({
        name: z.string().min(1),
        docsUrl: z.string().url().optional(),
        upstreamSpecRef: z.string().optional(),
        lastVerifiedAt: z.string().datetime({ offset: true }),
        notes: z.string().optional(),
      })
      .strict(),
    baseUrl: z.string().url(),
    auth: z
      .object({
        type: z.enum(["public", "bearer", "basic", "private_contract"]),
        credentialsRequired: z.boolean(),
        envVar: z.string().optional(),
        headerName: z.string().optional(),
        instructions: z.string().optional(),
      })
      .strict(),
    rateLimit: z
      .object({
        scopeHost: z.string().min(1),
        officialPolicy: z
          .object({
            burstRequestsPerSec: z.number().positive(),
            burstWindowSec: z.number().positive(),
            sustainedRequestsPerSec: z.number().positive(),
            sustainedWindowSec: z.number().positive(),
            penaltyOnViolation: z.string().optional(),
          })
          .strict(),
        quimeraGuardrail: z
          .object({
            burstRequestsPerSec: z.number().positive(),
            sustainedRequestsPerSec: z.number().positive(),
            maxRetriesOn5xx: z.number().int().min(0).optional(),
            circuitBreakerCooldownSec: z.number().positive().optional(),
          })
          .strict(),
      })
      .strict(),
    privacy: z
      .object({
        containsPersonalData: z.boolean(),
        logRedactionFields: z.array(z.string()),
        classification: z.string().optional(),
      })
      .strict(),
    cache: z
      .object({
        defaultTtlSec: z.number().int().positive(),
        allowStaleOnUpstreamError: z.boolean().optional(),
      })
      .strict(),
    operations: z.record(
      z.string(),
      z
        .object({
          method: z.enum(["GET"]),
          path: z.string().min(1),
          idempotent: z.boolean().default(true),
          queryParams: z.record(z.string(), QueryParamSchema).optional(),
          responses: z.record(z.string(), ResponseSpecSchema),
        })
        .strict(),
    ),
    contractTests: z
      .array(
        z
          .object({
            id: z.string().min(1),
            operation: z.string().min(1),
            params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
            fixture: z.string().optional(),
            expectStatus: z.number().int().optional(),
            expectLocalValidationError: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type ApiPassport = z.infer<typeof ApiPassportSchema>;
export type JsonSchemaNode = Record<string, unknown>;