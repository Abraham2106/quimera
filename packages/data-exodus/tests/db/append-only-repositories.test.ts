import { describe, expect, it } from "vitest";

import {
  createDecisionsRepository,
  createProvenanceRepository,
} from "../../src/db/index.js";
import * as decisionsModule from "../../src/db/repositories/decisions.js";
import * as provenanceModule from "../../src/db/repositories/provenance.js";

describe("T-SEC-005 — repositorios append-only", () => {
  it("no exporta update/delete en módulos de repositorio", () => {
    expect("update" in provenanceModule).toBe(false);
    expect("delete" in provenanceModule).toBe(false);
    expect("update" in decisionsModule).toBe(false);
    expect("delete" in decisionsModule).toBe(false);
  });

  it("las fábricas solo exponen insert y lecturas", () => {
    const provenance = createProvenanceRepository({} as never);
    const decisions = createDecisionsRepository({} as never);

    expect(Object.keys(provenance).sort()).toEqual(
      ["insert", "listByArtifact", "listByEntity"].sort(),
    );
    expect(Object.keys(decisions).sort()).toEqual(
      ["getById", "insert", "listByConflict"].sort(),
    );

    for (const repo of [provenance, decisions]) {
      expect("update" in repo).toBe(false);
      expect("delete" in repo).toBe(false);
    }
  });
});