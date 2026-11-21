import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "packages",
      include: ["packages/**/*.test.ts"],
      passWithNoTests: true,
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "apps",
      include: ["apps/**/*.test.ts"],
      passWithNoTests: true,
      env: {
        NODE_ENV: "test",
        OFICIOS_AUTH_MODE: "test-headers",
      },
    },
  },
]);