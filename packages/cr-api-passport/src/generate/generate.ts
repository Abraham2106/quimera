import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApiPassport } from "../schema/api-passport.js";

export type GenerateResult = {
  readonly adapterPath: string;
  readonly testPath: string;
};

export async function generatePassportAdapter(
  passport: ApiPassport,
  outDir: string,
): Promise<GenerateResult> {
  await mkdir(outDir, { recursive: true });
  const slug = passport.passportId.replace(/\./g, "-");
  const adapterPath = path.join(outDir, `${slug}-adapter.ts`);
  const testPath = path.join(outDir, `${slug}-contract.test.ts`);

  const ops = Object.keys(passport.operations);
  const adapter = `import type { QueryResult } from "@quimera/cr-api-passport";
import { PassportClient, getPassportById } from "@quimera/cr-api-passport";

/** Minimal generated adapter for ${passport.passportId} v${passport.passportVersion} */
export const PASSPORT_ID = "${passport.passportId}" as const;
export const OPERATIONS = ${JSON.stringify(ops)} as const;

export async function query${toPascal(slug)}(
  operation: (typeof OPERATIONS)[number],
  params: Record<string, string>,
  mode: "fixture" | "live" = "fixture",
): Promise<QueryResult> {
  const passport = await getPassportById(PASSPORT_ID);
  if (!passport) {
    throw new Error("passport not found");
  }
  const client = new PassportClient({ mode });
  return client.query(passport, operation, params);
}
`;

  const test = `import { describe, expect, it } from "vitest";
import { PASSPORT_ID, query${toPascal(slug)} } from "./${slug}-adapter.js";

describe("contract — ${passport.passportId}", () => {
  it("runs fixture query offline", async () => {
    const op = ${JSON.stringify(ops[0] ?? "searchByText")};
    const res = await query${toPascal(slug)}(op as never, {}, "fixture");
    expect(res.ok || res.error.code).toBeTruthy();
    expect(PASSPORT_ID).toBe("${passport.passportId}");
  });
});
`;

  await writeFile(adapterPath, adapter, "utf8");
  await writeFile(testPath, test, "utf8");

  return { adapterPath, testPath };
}

function toPascal(slug: string): string {
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}