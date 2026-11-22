import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FsArtifactStore } from "../../src/storage/fs-artifact-store.js";

const TENANT = "018f4e7a-90e0-7000-8000-000000000010";
const OTHER_TENANT = "018f4e7a-90e0-7000-8000-000000000011";

describe("FsArtifactStore — validación y tenant", () => {
  let root: string;
  let store: FsArtifactStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "quimera-fsval-"));
    store = new FsArtifactStore(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rechaza MIME no permitido y artefactos demasiado grandes", async () => {
    const badMime = await store.put({
      tenantId: TENANT,
      bytes: Uint8Array.from([1, 2, 3]),
      artifactKind: "source_file",
      originalName: "evil.bin",
      mimeType: "application/x-evil",
    });
    expect(badMime.ok).toBe(false);
    if (!badMime.ok) expect(badMime.error.category).toBe("VALIDATION");

    const tooBig = await store.put({
      tenantId: TENANT,
      bytes: new Uint8Array(51 * 1024 * 1024),
      artifactKind: "source_file",
      originalName: "big.bin",
      mimeType: "application/octet-stream",
    });
    expect(tooBig.ok).toBe(false);
  });

  it("existsBySha256 respeta el tenant que hizo el put", async () => {
    const put = await store.put({
      tenantId: TENANT,
      bytes: Uint8Array.from([10, 20, 30]),
      artifactKind: "source_file",
      originalName: "ventas.csv",
      mimeType: "text/csv",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    expect(await store.existsBySha256(TENANT, put.data.sha256)).toBe(true);
    expect(await store.existsBySha256(OTHER_TENANT, put.data.sha256)).toBe(false);

    const reloaded = new FsArtifactStore(root);
    expect(await reloaded.existsBySha256(TENANT, put.data.sha256)).toBe(true);
  });
});
