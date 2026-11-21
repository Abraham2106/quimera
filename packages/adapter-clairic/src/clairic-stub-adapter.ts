import type {
  OperationResult,
  StructuredExtractorImageInput,
  StructuredExtractorPort,
} from "@quimera/core";

import { CLAIRIC_STUB_PROVIDER_ID } from "./constants.js";
import { validateClairicPayload } from "./limits.js";
import { stubExtractFromSchema } from "./stub-extract.js";

export class ClairicStubAdapter implements StructuredExtractorPort {
  readonly providerId = CLAIRIC_STUB_PROVIDER_ID;

  async extract<T>(request: {
    readonly schema: Record<string, unknown>;
    readonly text?: string;
    readonly images?: readonly StructuredExtractorImageInput[];
  }): Promise<
    OperationResult<{
      readonly value: T;
      readonly fields: Record<string, import("./stub-extract.js").ClairicFieldMeta>;
    }>
  > {
    const limitError = validateClairicPayload({
      text: request.text,
      images: request.images,
    });
    if (limitError) {
      return limitError;
    }

    const text = request.text ?? "";
    const { value, fields } = stubExtractFromSchema(request.schema, text);

    return {
      ok: true,
      data: {
        value: value as T,
        fields,
      },
      warnings: [],
    };
  }
}

export function createClairicStubAdapter(): ClairicStubAdapter {
  return new ClairicStubAdapter();
}