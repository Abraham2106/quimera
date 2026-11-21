import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      OFICIOS_AUTH_MODE: "test-headers",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://quimera:quimera@127.0.0.1:5432/quimera",
    },
  },
});