import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import type { Db } from "./client";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Applies every pending migration in packages/db/migrations. Already-applied
 * migrations are skipped, so running it twice is safe.
 */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
