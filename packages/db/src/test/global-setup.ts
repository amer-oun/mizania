import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

// Starts one throwaway Postgres (same major version as docker-compose and
// Neon) for the whole test run. Needs Docker running, locally and in CI.

declare module "vitest" {
  export interface ProvidedContext {
    postgresUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  project.provide("postgresUrl", container.getConnectionUri());

  return async () => {
    await container?.stop();
  };
}
