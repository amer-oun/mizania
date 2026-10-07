import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Starts a Postgres container (Testcontainers): Docker must be running.
    globalSetup: ["src/test/global-setup.ts"],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
