import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsArtifactStore } from "../../src/storage/fs-artifact-store.js";
import { resolveCasFilePath } from "../../src/storage/path-guards.js";

const TENANT_ID = "018f4e7a-90e0-7000-8000-000000000010";

describe("T-SEC-006 / T-SEC-003 — FsArtifactStore CAS", () => {
  let tmpRoot: string;
  let store: FsArtifactStore;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-cas-"));
    store = new FsArtifactStore(tmpRoot);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("put+get conserva bytes idénticos (QR-DATA-002)", async () => {
    const bytes = Uint8Array.from(
      { length: 256 },
      (_, i) => i % 256,
    );
    const put = await store.put({
      tenantId: TENANT_ID,
      bytes,
      artifactKind: "source_file",
      originalName: "payload.bin",
      mimeType: "application/octet-stream",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    expect(put.data.storageUri).toMatch(/^cas:\/\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/);
    expect(await store.existsBySha256(TENANT_ID, put.data.sha256)).toBe(true);

    const got = await store.get(put.data.storageUri);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.data.byteLength).toBe(bytes.byteLength);
    for (let i = 0; i < bytes.byteLength; i += 1) {
      expect(got.data[i]).toBe(bytes[i]);
    }
  });

  it("alterar 1 byte dispara ERR_ARTIFACT_INTEGRITY_FAILED (T-SEC-006)", async () => {
    const bytes = Buffer.from("immutable-evidence", "utf8");
    const put = await store.put({
      tenantId: TENANT_ID,
      bytes,
      artifactKind: "source_file",
      originalName: "note.txt",
      mimeType: "text/plain",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    const filePath = resolveCasFilePath(tmpRoot, put.data.sha256);
    await fs.chmod(filePath, 0o644);
    const onDisk = await fs.readFile(filePath);
    onDisk[0] = onDisk[0]! ^ 0xff;
    await fs.writeFile(filePath, onDisk);
    await fs.chmod(filePath, 0o444);

    const got = await store.get(put.data.storageUri);
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.error.code).toBe("ERR_ARTIFACT_INTEGRITY_FAILED");
    expect(got.error.category).toBe("SECURITY");
    expect(got.error.module).toBe("@quimera/data-exodus");
  });

  it("rechaza originalName con path traversal (T-SEC-003)", async () => {
    const put = await store.put({
      tenantId: TENANT_ID,
      bytes: Buffer.from("x"),
      artifactKind: "source_file",
      originalName: "../../etc/passwd",
      mimeType: "text/plain",
    });
    expect(put.ok).toBe(false);
    if (put.ok) return;
    expect(put.error.code).toBe("ERR_SEC_PATH_TRAVERSAL");
    expect(put.error.category).toBe("SECURITY");
  });

  it("rechaza storageUri inválida o fuera de contrato CAS", async () => {
    const got = await store.get("cas://sha256/ab/not-a-valid-hash");
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.error.code).toBe("ERR_SEC_PATH_TRAVERSAL");

    const sha = createHash("sha256").update("probe").digest("hex");
    const prefix = sha.slice(0, 2);
    const mismatched = `cas://sha256/${prefix === "00" ? "ff" : "00"}/${sha}`;
    const got2 = await store.get(mismatched);
    expect(got2.ok).toBe(false);
    if (got2.ok) return;
    expect(got2.error.code).toBe("ERR_SEC_PATH_TRAVERSAL");
  });

  it("escribe con permisos 0444 bajo root/<aa>/<cd>/<sha256>", async () => {
    const bytes = Buffer.from(randomUUID(), "utf8");
    const put = await store.put({
      tenantId: TENANT_ID,
      bytes,
      artifactKind: "source_file",
      originalName: "perms-check.dat",
      mimeType: "application/octet-stream",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    const filePath = resolveCasFilePath(tmpRoot, put.data.sha256);
    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o444);
    expect(filePath).toBe(
      path.join(
        tmpRoot,
        put.data.sha256.slice(0, 2),
        put.data.sha256.slice(2, 4),
        put.data.sha256,
      ),
    );
  });
});