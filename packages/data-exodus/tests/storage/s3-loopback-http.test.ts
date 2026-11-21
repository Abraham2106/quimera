import { createHash } from "node:crypto";
import http from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  FISCAL_RETENTION_DAYS,
  createS3ArtifactStore,
} from "../../src/index.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const BUCKET = "quimera-test";
const REGION = "us-east-1";
const ACCESS = "test-access-key";
const SECRET = "test-secret-key";

type Stored = {
  bytes: Buffer;
  contentType: string;
  retainUntil: string | null;
};

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseKey(reqUrl: string): string | null {
  const prefix = `/${BUCKET}/`;
  const path = new URL(reqUrl, "http://127.0.0.1").pathname;
  if (!path.startsWith(prefix)) {
    return null;
  }
  return decodeURIComponent(path.slice(prefix.length));
}

describe("S3ArtifactStore — loopback HTTP SigV4", () => {
  const objects = new Map<string, Stored>();
  let server: http.Server;
  let endpoint: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const key = parseKey(req.url ?? "/");
      if (!key) {
        res.statusCode = 404;
        res.end();
        return;
      }
      if (req.method === "PUT") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk as Buffer));
        req.on("end", () => {
          const bytes = Buffer.concat(chunks);
          objects.set(key, {
            bytes,
            contentType: req.headers["content-type"] ?? "application/octet-stream",
            retainUntil:
              typeof req.headers["x-amz-object-lock-retain-until-date"] === "string"
                ? req.headers["x-amz-object-lock-retain-until-date"]
                : null,
          });
          res.statusCode = 200;
          res.end();
        });
        return;
      }
      if (req.method === "GET") {
        const stored = objects.get(key);
        if (!stored) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", stored.contentType);
        if (stored.retainUntil) {
          res.setHeader("x-amz-object-lock-retain-until-date", stored.retainUntil);
        }
        res.end(stored.bytes);
        return;
      }
      if (req.method === "DELETE") {
        const stored = objects.get(key);
        if (!stored) {
          res.statusCode = 404;
          res.end();
          return;
        }
        objects.delete(key);
        res.statusCode = 204;
        res.end();
        return;
      }
      res.statusCode = 405;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address() as AddressInfo;
    endpoint = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("PUT y GET conservan los mismos bytes SHA-256", async () => {
    const bytes = new TextEncoder().encode("loopback-payload");
    const expectedSha = sha256Hex(bytes);
    const store = createS3ArtifactStore({
      endpoint,
      bucket: BUCKET,
      region: REGION,
      accessKeyId: ACCESS,
      secretAccessKey: SECRET,
    });
    const put = await store.put({
      tenantId: TENANT,
      bytes,
      artifactKind: "work_order_photo",
      originalName: "foto.jpg",
      mimeType: "image/jpeg",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    expect(put.data.sha256).toBe(expectedSha);
    const got = await store.get(put.data.storageUri);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(sha256Hex(got.data)).toBe(expectedSha);
  });

  it("rechaza borrar evidencia fiscal dentro de 1825 días", async () => {
    const now = new Date("2026-11-21T00:00:00.000Z");
    const store = createS3ArtifactStore({
      endpoint,
      bucket: BUCKET,
      region: REGION,
      accessKeyId: ACCESS,
      secretAccessKey: SECRET,
      now: () => now,
    });
    const put = await store.put({
      tenantId: TENANT,
      bytes: new TextEncoder().encode("retained"),
      artifactKind: "source_file",
      originalName: "origen.csv",
      mimeType: "text/csv",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    const blocked = await store.delete(put.data.storageUri, now);
    expect(blocked.ok).toBe(false);
    const later = new Date(now.getTime());
    later.setUTCDate(later.getUTCDate() + FISCAL_RETENTION_DAYS + 1);
    const allowed = await store.delete(put.data.storageUri, later);
    expect(allowed.ok).toBe(true);
  });

  it("la cuarentena bloquea un objeto malicioso antes de persistir", async () => {
    const store = createS3ArtifactStore({
      endpoint,
      bucket: BUCKET,
      region: REGION,
      accessKeyId: ACCESS,
      secretAccessKey: SECRET,
      quarantine: {
        async inspect(input) {
          if (input.originalName.includes("blocked")) {
            return {
              ok: false,
              warnings: [],
              error: {
                code: "ERR_ARTIFACT_STORE",
                category: "SECURITY",
                message: "cuarentena",
                retryable: false,
                correlationId: "00000000-0000-4000-8000-000000000002",
                module: "@quimera/data-exodus",
              },
            };
          }
          return { ok: true, data: undefined, warnings: [] };
        },
      },
    });
    const beforeKeys = new Set(objects.keys());
    const put = await store.put({
      tenantId: TENANT,
      bytes: new TextEncoder().encode("x"),
      artifactKind: "source_file",
      originalName: "blocked.csv",
      mimeType: "text/csv",
    });
    expect(put.ok).toBe(false);
    const newKeys = [...objects.keys()].filter((k) => !beforeKeys.has(k));
    expect(newKeys).toHaveLength(0);
  });
});