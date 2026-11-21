import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walks upward from `import.meta.url` until `fixtures/demo-hvac-1000` exists.
 */
export function resolveDemoHvacFixtureRoot(fromModuleUrl: string): string {
  let dir = path.dirname(fileURLToPath(fromModuleUrl));
  for (let i = 0; i < 12; i += 1) {
    const candidate = path.join(dir, "fixtures", "demo-hvac-1000");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("fixtures/demo-hvac-1000 not found from module path");
}