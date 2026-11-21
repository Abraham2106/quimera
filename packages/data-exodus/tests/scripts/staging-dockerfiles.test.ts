import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readDockerfile(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), "utf8");
}

describe("staging Dockerfiles", () => {
  it("oficios-api corre como usuario node", () => {
    const dockerfile = readDockerfile("deploy/oficios-api.Dockerfile");
    expect(dockerfile).toMatch(/USER node/);
    expect(dockerfile).not.toMatch(/USER root/);
  });

  it("fiscal-outbox-worker corre como usuario node", () => {
    const dockerfile = readDockerfile("deploy/fiscal-outbox-worker.Dockerfile");
    expect(dockerfile).toMatch(/USER node/);
    expect(dockerfile).not.toMatch(/USER root/);
  });
});