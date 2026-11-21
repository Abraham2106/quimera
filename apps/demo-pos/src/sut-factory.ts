import { createBuggySut, type FiscalSut } from "@quimera/factura-ci";
import type { Sql } from "postgres";

import { createOutboxSut } from "./outbox-sut.js";

export type DemoPosMode = "buggy" | "outbox";

export function createDemoPosSut(
  mode: DemoPosMode,
  simulatorBaseUrl: string,
  db?: Sql,
): FiscalSut {
  if (mode === "buggy") {
    return createBuggySut(simulatorBaseUrl);
  }
  if (!db) {
    throw new Error("demo-pos outbox mode requires a PostgreSQL client");
  }
  return createOutboxSut(simulatorBaseUrl, db);
}