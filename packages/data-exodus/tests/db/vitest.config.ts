import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    maxWorkers: 1,
  },
});