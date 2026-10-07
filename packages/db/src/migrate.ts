import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDb } from "./client";
import { requireDatabaseUrl } from "./env";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

const { db, client } = createDb(requireDatabaseUrl(), { max: 1 });

try {
  await migrate(db, { migrationsFolder });
  console.info("Migrations applied.");
} finally {
  await client.end();
}
