import { createHash } from "node:crypto";

import type { ObjectLockClient, StoredObject } from "./s3-artifact-store.js";
import { signAwsSigV4 } from "./aws-sigv4.js";

export type S3HttpObjectLockClientOptions = {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly forcePathStyle?: boolean;
};

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

function objectUrl(options: S3HttpObjectLockClientOptions, key: string): URL {
  const base = normalizeEndpoint(options.endpoint);
  const pathStyle = options.forcePathStyle ?? true;
  if (pathStyle) {
    return new URL(
      `${base}/${encodeURIComponent(options.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    );
  }
  const hostBase = base.replace(/^https?:\/\//, "");
  return new URL(`https://${options.bucket}.${hostBase}/${key.split("/").map(encodeURIComponent).join("/")}`);
}

async function readBody(response: Response): Promise<Uint8Array> {
  const buf = await response.arrayBuffer();
  return new Uint8Array(buf);
}

export class S3HttpObjectLockClient implements ObjectLockClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: S3HttpObjectLockClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    retainUntil: string | null;
  }): Promise<void> {
    const url = objectUrl(this.options, input.key);
    const headers: Record<string, string> = {
      "content-type": input.contentType,
      "content-length": String(input.bytes.byteLength),
    };
    if (input.retainUntil) {
      headers["x-amz-object-lock-retain-until-date"] = input.retainUntil;
    }
    const signed = signAwsSigV4({
      method: "PUT",
      url,
      headers,
      body: input.bytes,
      accessKeyId: this.options.accessKeyId,
      secretAccessKey: this.options.secretAccessKey,
      region: this.options.region,
    });
    const response = await this.fetchImpl(url, {
      method: "PUT",
      headers: signed,
      body: input.bytes,
    });
    if (!response.ok) {
      throw new Error(`S3 PUT ${input.key} failed: HTTP ${response.status}`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const url = objectUrl(this.options, key);
    const signed = signAwsSigV4({
      method: "GET",
      url,
      headers: {},
      accessKeyId: this.options.accessKeyId,
      secretAccessKey: this.options.secretAccessKey,
      region: this.options.region,
    });
    const response = await this.fetchImpl(url, { method: "GET", headers: signed });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`S3 GET ${key} failed: HTTP ${response.status}`);
    }
    const bytes = await readBody(response);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const retainUntil = response.headers.get("x-amz-object-lock-retain-until-date");
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    return {
      bytes,
      sha256,
      retainUntil: retainUntil?.trim() || null,
      contentType,
    };
  }

  async delete(key: string, now: Date): Promise<"deleted" | "retained" | "missing"> {
    const existing = await this.get(key);
    if (!existing) {
      return "missing";
    }
    if (existing.retainUntil && new Date(existing.retainUntil).getTime() > now.getTime()) {
      return "retained";
    }
    const url = objectUrl(this.options, key);
    const signed = signAwsSigV4({
      method: "DELETE",
      url,
      headers: {},
      accessKeyId: this.options.accessKeyId,
      secretAccessKey: this.options.secretAccessKey,
      region: this.options.region,
    });
    const response = await this.fetchImpl(url, { method: "DELETE", headers: signed });
    if (response.status === 404) {
      return "missing";
    }
    if (!response.ok) {
      throw new Error(`S3 DELETE ${key} failed: HTTP ${response.status}`);
    }
    return "deleted";
  }
}