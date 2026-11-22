import { describe, expect, it } from "vitest";

import { ERR_CLAIRIC_PAYLOAD_LIMIT } from "./constants.js";
import { createClairicStubAdapter } from "./clairic-stub-adapter.js";

const schema = {
  type: "object",
  properties: { note: { type: "string" } },
} as const;

function jpegImage(byteLength: number): { mimeType: "image/jpeg"; bytes: Uint8Array } {
  return {
    mimeType: "image/jpeg",
    bytes: new Uint8Array(byteLength),
  };
}

describe("T-CLAI-002 — local payload limits (QR-CLAI-002)", () => {
  const adapter = createClairicStubAdapter({ env: { QUIMERA_AI_ENABLED: "true" } });

  it("rejects more than 4 images", async () => {
    const images = Array.from({ length: 5 }, () => jpegImage(16));
    const result = await adapter.extract({ schema, images });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERR_CLAIRIC_PAYLOAD_LIMIT);
    }
  });

  it("rejects a single file larger than 4 MiB", async () => {
    const result = await adapter.extract({
      schema,
      images: [jpegImage(4 * 1024 * 1024 + 1)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERR_CLAIRIC_PAYLOAD_LIMIT);
    }
  });

  it("rejects decoded total larger than 8 MiB", async () => {
    const half = 4 * 1024 * 1024;
    const result = await adapter.extract({
      schema,
      images: [jpegImage(half), jpegImage(half), jpegImage(1)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERR_CLAIRIC_PAYLOAD_LIMIT);
    }
  });

  it("rejects remote https URL in text", async () => {
    const result = await adapter.extract({
      schema,
      text: "ver documento en https://evil.example/doc.pdf",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERR_CLAIRIC_PAYLOAD_LIMIT);
    }
  });

  it("rejects remote http URL embedded in image bytes", async () => {
    const bytes = new TextEncoder().encode("meta https://remote.example/x");
    const result = await adapter.extract({
      schema,
      images: [{ mimeType: "image/png", bytes }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERR_CLAIRIC_PAYLOAD_LIMIT);
    }
  });
});