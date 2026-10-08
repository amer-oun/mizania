import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Integration tests run against a Postgres container (Testcontainers),
    // shared with packages/db: Docker must be running.
    globalSetup: ["../db/src/test/global-setup.ts"],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
