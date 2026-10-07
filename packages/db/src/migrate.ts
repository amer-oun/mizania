import { createDb } from "./client";
import { requireDatabaseUrl } from "./env";
import { runMigrations } from "./migrations";

const { db, client } = createDb(requireDatabaseUrl(), { max: 1 });

try {
  await runMigrations(db);
  console.info("Migrations applied.");
} finally {
  await client.end();
}
