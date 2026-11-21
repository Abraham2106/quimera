import { describe, expect, it } from "vitest";

import {
  artifactSha256,
  ResumeArtifactHashError,
  runResumableBatch,
} from "../../src/migrate/resumable-batch.js";

function mapItem(item: string, index: number): string {
  return `${index}:${item.trim().toUpperCase()}`;
}

describe("T-DATA-012 / AT-09 corte al 50% y resume", () => {
  it("resume produce el mismo resultado que una corrida continua y conserva el hash", () => {
    const artifact = new TextEncoder().encode("lote-sintetico-linea-1\nlote-sintetico-linea-2\n");
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const digest = artifactSha256(artifact);

    const continuous = runResumableBatch({
      artifactBytes: artifact,
      items,
      mapItem,
    });
    expect(continuous.interrupted).toBe(false);
    expect(continuous.checkpoint.artifactSha256).toBe(digest);
    expect(continuous.checkpoint.completed).toBe(items.length);

    const cut = runResumableBatch({
      artifactBytes: artifact,
      items,
      mapItem,
      interruptAfterRatio: 0.5,
    });
    expect(cut.interrupted).toBe(true);
    expect(cut.checkpoint.completed).toBe(4);
    expect(cut.checkpoint.artifactSha256).toBe(digest);

    const resumed = runResumableBatch({
      artifactBytes: artifact,
      items,
      mapItem,
      checkpoint: cut.checkpoint,
    });
    expect(resumed.interrupted).toBe(false);
    expect(resumed.checkpoint.outputs).toEqual(continuous.checkpoint.outputs);
    expect(resumed.checkpoint.artifactSha256).toBe(digest);
    expect(artifactSha256(artifact)).toBe(digest);
  });

  it("rechaza resume si el artefacto cambió", () => {
    const items = ["a", "b", "c", "d"];
    const original = new TextEncoder().encode("original");
    const cut = runResumableBatch({
      artifactBytes: original,
      items,
      mapItem,
      interruptAfterRatio: 0.5,
    });
    expect(() =>
      runResumableBatch({
        artifactBytes: new TextEncoder().encode("mutado"),
        items,
        mapItem,
        checkpoint: cut.checkpoint,
      }),
    ).toThrow(ResumeArtifactHashError);
  });
});