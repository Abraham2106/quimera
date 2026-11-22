import { describe, expect, it } from "vitest";

import {
  artifactSha256,
  runResumableBatch,
} from "../../src/migrate/resumable-batch.js";

const artifact = new TextEncoder().encode("artefacto-sintetico");
const items = ["a", "b", "c", "d"];
const digest = artifactSha256(artifact);
const mapItem = (item: string, index: number) => `${index}:${item}`;

describe("runResumableBatch — validaciones de checkpoint", () => {
  it("rechaza checkpoint donde outputs.length !== completed", () => {
    expect(() =>
      runResumableBatch({
        artifactBytes: artifact,
        items,
        mapItem,
        checkpoint: { artifactSha256: digest, completed: 2, outputs: ["0:a"] },
      }),
    ).toThrow(/outputs\.length/);
  });

  it("rechaza ratio no finito", () => {
    for (const ratio of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        runResumableBatch({ artifactBytes: artifact, items, mapItem, interruptAfterRatio: ratio }),
      ).toThrow(/finite/);
    }
  });

  it("acepta un checkpoint coherente y continúa", () => {
    const checkpoint = {
      artifactSha256: digest,
      completed: 2,
      outputs: ["0:a", "1:b"],
    };
    const resumed = runResumableBatch({ artifactBytes: artifact, items, mapItem, checkpoint });
    expect(resumed.checkpoint.completed).toBe(4);
    expect(resumed.checkpoint.outputs).toEqual(["0:a", "1:b", "2:c", "3:d"]);
  });
});
