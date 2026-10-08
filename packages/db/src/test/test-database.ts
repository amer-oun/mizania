import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { inject } from "vitest";

import { createDb, type Db } from "../client";
import { runMigrations } from "../migrations";

declare module "vitest" {
  export interface ProvidedContext {
    /** Set by global-setup.ts: the test container's server URL. */
    postgresUrl: string;
  }
}

export interface TestDatabase {
  db: Db;
  close: () => Promise<void>;
}

/**
 * Creates an empty database with a unique name inside the test container and
 * applies all migrations, so every test file starts from a clean schema.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const serverUrl = inject("postgresUrl");
  const name = `test_${randomUUID().replaceAll("-", "")}`;

  const admin = postgres(serverUrl, { max: 1 });
  try {
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const { db, client } = createDb(url.toString(), { max: 2 });
  await runMigrations(db);

  return { db, close: () => client.end() };
}
