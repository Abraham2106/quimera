import { describe, expect, it } from "vitest";
import {
  FixedClock,
  InMemoryArtifactStore,
  MemoryLogger,
} from "./index.js";

describe("T-CORE-010 — puertos in-memory", () => {
  it("almacena y recupera artefactos sin disco", async () => {
    const store = new InMemoryArtifactStore();
    const bytes = Buffer.from("hello", "utf8");
    const put = await store.put({
      tenantId: "018f4e7a-90e0-7000-8000-000000000010",
      bytes,
      artifactKind: "source_file",
      originalName: "a.txt",
      mimeType: "text/plain",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    const got = await store.get(put.data.storageUri);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(Buffer.from(got.data).toString("utf8")).toBe("hello");
    expect(await store.existsBySha256(put.data.tenantId, put.data.sha256)).toBe(true);
  });

  it("reloj fijo y logger en memoria", () => {
    const clock = new FixedClock(new Date("2026-01-01T12:00:00.000Z"));
    expect(clock.nowIso()).toBe("2026-01-01T12:00:00.000Z");
    const logger = new MemoryLogger();
    logger.info("stored", { n: 1 });
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]?.level).toBe("info");
  });
});