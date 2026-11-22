import { createHash, createHmac } from "node:crypto";

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Codificación de segmentos de URI compatible con SigV4 para S3. */
export function awsUriEncode(input: string, encodeSlash = false): string {
  return input
    .split("")
    .map((ch) => {
      if (
        (ch >= "A" && ch <= "Z") ||
        (ch >= "a" && ch <= "z") ||
        (ch >= "0" && ch <= "9") ||
        ch === "_" ||
        ch === "-" ||
        ch === "~" ||
        ch === "."
      ) {
        return ch;
      }
      if (ch === "/" && !encodeSlash) {
        return "/";
      }
      return `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
}

export type AwsSigV4SignInput = {
  readonly method: string;
  readonly url: URL;
  readonly headers: Record<string, string>;
  readonly body?: Uint8Array;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
  readonly service?: "s3";
  readonly amzDate?: string;
};

export function signAwsSigV4(input: AwsSigV4SignInput): Record<string, string> {
  const service = input.service ?? "s3";
  const amzDate =
    input.amzDate ??
    new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = input.body ? sha256Hex(Buffer.from(input.body)) : sha256Hex("");

  const host = input.url.host;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers)) {
    headers[key.toLowerCase()] = value;
  }
  headers.host = host;
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = payloadHash;

  const signedHeaderNames = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();

  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]?.trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalUri = awsUriEncode(input.url.pathname, false);
  const canonicalQuery = input.url.search ? input.url.search.slice(1) : "";
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join(
    "\n",
  );

  const kDate = hmacSha256(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, input.region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    Authorization: authorization,
  };
}