import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

import type {} from "./test-database"; // ProvidedContext.postgresUrl

// Starts one throwaway Postgres (same major version as docker-compose and
// Neon) for the whole test run. Needs Docker running, locally and in CI.
// packages/auth uses it too (see its vitest.config.ts).

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  project.provide("postgresUrl", container.getConnectionUri());

  return async () => {
    await container?.stop();
  };
}
