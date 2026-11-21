import { randomUUID } from "node:crypto";

import type { OperationResult } from "@quimera/core";
import type {
  StructuredExtractorImageInput,
} from "@quimera/core";

import {
  ERR_CLAIRIC_PAYLOAD_LIMIT,
  MAX_CLAIRIC_FILE_BYTES,
  MAX_CLAIRIC_IMAGES,
  MAX_CLAIRIC_TOTAL_BYTES,
  REMOTE_URL_PATTERN,
} from "./constants.js";

export type PayloadLimitReason =
  | "too_many_images"
  | "file_too_large"
  | "total_too_large"
  | "remote_url_in_text"
  | "remote_url_in_image";

function payloadLimitError(
  message: string,
  details: Record<string, unknown>,
): OperationResult<never> {
  return {
    ok: false,
    error: {
      code: ERR_CLAIRIC_PAYLOAD_LIMIT,
      category: "VALIDATION",
      message,
      retryable: false,
      correlationId: randomUUID(),
      module: "@quimera/adapter-clairic",
      details,
    },
    warnings: [],
  };
}

export function containsRemoteUrl(source: string): boolean {
  return REMOTE_URL_PATTERN.test(source);
}

export function scanBytesForRemoteUrl(bytes: Uint8Array): boolean {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return containsRemoteUrl(decoded);
}

export function validateClairicPayload(input: {
  readonly text?: string;
  readonly images?: readonly StructuredExtractorImageInput[];
}): OperationResult<never> | null {
  const images = input.images ?? [];
  if (images.length > MAX_CLAIRIC_IMAGES) {
    return payloadLimitError("Clairic payload exceeds maximum image count", {
      reason: "too_many_images" satisfies PayloadLimitReason,
      imageCount: images.length,
      maxImages: MAX_CLAIRIC_IMAGES,
    });
  }

  let totalBytes = 0;
  for (const image of images) {
    const size = image.bytes.byteLength;
    totalBytes += size;
    if (size > MAX_CLAIRIC_FILE_BYTES) {
      return payloadLimitError("Clairic payload contains a file larger than 4 MiB", {
        reason: "file_too_large" satisfies PayloadLimitReason,
        byteSize: size,
        maxFileBytes: MAX_CLAIRIC_FILE_BYTES,
      });
    }
    if (scanBytesForRemoteUrl(image.bytes)) {
      return payloadLimitError(
        "Clairic payload must not contain remote http(s) URLs in image bytes",
        { reason: "remote_url_in_image" satisfies PayloadLimitReason },
      );
    }
  }

  if (totalBytes > MAX_CLAIRIC_TOTAL_BYTES) {
    return payloadLimitError("Clairic payload exceeds 8 MiB decoded total", {
      reason: "total_too_large" satisfies PayloadLimitReason,
      totalBytes,
      maxTotalBytes: MAX_CLAIRIC_TOTAL_BYTES,
    });
  }

  if (input.text && containsRemoteUrl(input.text)) {
    return payloadLimitError(
      "Clairic payload must not contain remote http(s) URLs in text",
      { reason: "remote_url_in_text" satisfies PayloadLimitReason },
    );
  }

  return null;
}