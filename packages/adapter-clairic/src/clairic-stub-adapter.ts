import { randomUUID } from "node:crypto";

import type {
  ConflictCode,
  OperationResult,
  StructuredExtractorImageInput,
  StructuredExtractorPort,
} from "@quimera/core";

import {
  CLAIRIC_STUB_PROVIDER_ID,
  ERR_CLAIRIC_AI_DISABLED,
  W_AI_LOW_CONFIDENCE,
} from "./constants.js";
import { validateClairicPayload } from "./limits.js";
import { lowConfidenceConflict } from "./low-confidence.js";
import {
  stubExtractFromSchema,
  type ClairicFieldMeta,
} from "./stub-extract.js";

export type ClairicStubAdapterOptions = {
  readonly env?: NodeJS.ProcessEnv;
};

function disabledError(): OperationResult<never> {
  return {
    ok: false,
    error: {
      code: ERR_CLAIRIC_AI_DISABLED,
      category: "SECURITY",
      message: "Clairic adapter is disabled; set QUIMERA_AI_ENABLED=true",
      retryable: false,
      correlationId: randomUUID(),
      module: "@quimera/adapter-clairic",
      details: { envVar: "QUIMERA_AI_ENABLED", expected: "true" },
    },
    warnings: [],
  };
}

export class ClairicStubAdapter implements StructuredExtractorPort {
  readonly providerId = CLAIRIC_STUB_PROVIDER_ID;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: ClairicStubAdapterOptions = {}) {
    this.env = options.env ?? process.env;
  }

  async extract<T>(request: {
    readonly schema: Record<string, unknown>;
    readonly text?: string;
    readonly images?: readonly StructuredExtractorImageInput[];
  }): Promise<
    OperationResult<{
      readonly value: T;
      readonly fields: Record<string, ClairicFieldMeta>;
      readonly conflictCodes: readonly ConflictCode[];
    }>
  > {
    if (this.env.QUIMERA_AI_ENABLED !== "true") {
      return disabledError();
    }

    const limitError = validateClairicPayload({
      text: request.text,
      images: request.images,
    });
    if (limitError) {
      return limitError;
    }

    const text = request.text ?? "";
    const { value, fields } = stubExtractFromSchema(request.schema, text);

    const conflictCodes: ConflictCode[] = [];
    const conflictingFields: string[] = [];
    for (const [field, meta] of Object.entries(fields)) {
      const code = lowConfidenceConflict(meta);
      if (code) {
        conflictingFields.push(field);
        if (!conflictCodes.includes(code)) {
          conflictCodes.push(code);
        }
      }
    }

    return {
      ok: true,
      data: {
        value: value as T,
        fields,
        conflictCodes,
      },
      warnings:
        conflictCodes.length > 0
          ? [
              {
                code: W_AI_LOW_CONFIDENCE,
                message: "Extracción con baja confianza; requiere revisión humana",
                context: { conflictCodes, fields: conflictingFields },
              },
            ]
          : [],
    };
  }
}

export function createClairicStubAdapter(
  options: ClairicStubAdapterOptions = {},
): ClairicStubAdapter {
  return new ClairicStubAdapter(options);
}
