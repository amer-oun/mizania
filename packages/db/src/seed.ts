import { createDb } from "./client";
import { requireDatabaseUrl } from "./env";
import { seedDefaultCategories } from "./seed/seed-default-categories";

const { db, client } = createDb(requireDatabaseUrl(), { max: 1 });

try {
  const count = await seedDefaultCategories(db);
  console.info(`Seeded ${count} default categories.`);
} finally {
  await client.end();
}
