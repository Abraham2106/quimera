import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ConflictSchema } from "../schemas/conflicts.js";
import { ResolutionDecisionSchema } from "../schemas/decisions.js";
import { QuimeraErrorSchema } from "../schemas/errors.js";
import { EvidenceArtifactSchema } from "../schemas/artifacts.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "../../schemas/core-contracts.schema.json");

const toDef = (schema: z.ZodType) =>
  z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  });

const document = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://quimera.dev/schemas/core-contracts/1.0.0/schema.json",
  title: "QUIMERA Core Contracts v1.0.0",
  description:
    "Contratos canónicos de intercambio para evidencia, conflictos, decisiones de reconciliación y errores.",
  $defs: {
    Uuid: {
      type: "string",
      format: "uuid",
    },
    Sha256Hex: {
      type: "string",
      pattern: "^[a-f0-9]{64}$",
    },
    EvidenceArtifact: toDef(EvidenceArtifactSchema),
    Conflict: toDef(ConflictSchema),
    ResolutionDecision: toDef(ResolutionDecisionSchema),
    QuimeraError: toDef(QuimeraErrorSchema),
  },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);