import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://quimera:quimera@127.0.0.1:5432/quimera",
    },
  },
});
