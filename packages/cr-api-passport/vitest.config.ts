import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      zod: path.join(root, "../core/node_modules/zod/index.js"),
      "@quimera/core": path.join(root, "../core/src/index.ts"),
    },
  },
});