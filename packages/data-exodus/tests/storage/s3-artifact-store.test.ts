import { describe, expect, it } from "vitest";

import {
  FISCAL_RETENTION_DAYS,
  MemoryObjectLockClient,
  S3ArtifactStore,
} from "../../src/storage/s3-artifact-store.js";

const TENANT = "11111111-1111-4111-8111-111111111111";

describe("S3ArtifactStore", () => {
  it("rechaza un byte alterado con ERR_ARTIFACT_INTEGRITY_FAILED", async () => {
    const objects = new MemoryObjectLockClient();
    const store = new S3ArtifactStore(objects);
    const put = await store.put({
      tenantId: TENANT,
      bytes: new TextEncoder().encode("<FacturaElectronica/>"),
      artifactKind: "fe_xml_signed",
      originalName: "factura.xml",
      mimeType: "application/xml",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    const key = put.data.storageUri.replace("s3://", "");
    objects.corrupt(key);
    const got = await store.get(put.data.storageUri);
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.error.code).toBe("ERR_ARTIFACT_INTEGRITY_FAILED");
  });

  it("bloquea el borrado de evidencia fiscal dentro de 1825 días", async () => {
    const objects = new MemoryObjectLockClient();
    const now = new Date("2026-11-21T00:00:00.000Z");
    const store = new S3ArtifactStore(objects, { now: () => now });
    const put = await store.put({
      tenantId: TENANT,
      bytes: new TextEncoder().encode("origen"),
      artifactKind: "source_file",
      originalName: "clientes.csv",
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

  it("aísla el mismo hash en prefijos de tenant distintos", async () => {
    const store = new S3ArtifactStore(new MemoryObjectLockClient());
    const bytes = new TextEncoder().encode("mismo");
    const other = "22222222-2222-4222-8222-222222222222";
    const put = await store.put({
      tenantId: TENANT,
      bytes,
      artifactKind: "work_order_photo",
      originalName: "foto.jpg",
      mimeType: "image/jpeg",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    expect(put.data.storageUri.startsWith(`s3://tenants/${TENANT}/sha256/`)).toBe(true);
    expect(await store.existsBySha256(other, put.data.sha256)).toBe(false);
  });

  it("la cuarentena rechaza el archivo antes de persistirlo", async () => {
    const objects = new MemoryObjectLockClient();
    const store = new S3ArtifactStore(objects, {
      quarantine: {
        async inspect() {
          return {
            ok: false,
            warnings: [],
            error: {
              code: "ERR_ARTIFACT_STORE",
              category: "SECURITY",
              message: "cuarentena",
              retryable: false,
              correlationId: "00000000-0000-4000-8000-000000000001",
              module: "@quimera/data-exodus",
            },
          };
        },
      },
    });
    const put = await store.put({
      tenantId: TENANT,
      bytes: new TextEncoder().encode("x"),
      artifactKind: "source_file",
      originalName: "a.csv",
      mimeType: "text/csv",
    });
    expect(put.ok).toBe(false);
    expect(await store.existsBySha256(TENANT, "ab".repeat(32))).toBe(false);
  });
});
