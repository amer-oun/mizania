import { sql } from "drizzle-orm";

import { createDb } from "./client";
import { requireDatabaseUrl } from "./env";
import { categories } from "./schema";
import { defaultCategories } from "./seed/default-categories";

const { db, client } = createDb(requireDatabaseUrl(), { max: 1 });

try {
  // Idempotent: re-running updates the default categories in place.
  await db
    .insert(categories)
    .values(defaultCategories.map((c, position) => ({ ...c, userId: null, position })))
    .onConflictDoUpdate({
      target: categories.key,
      targetWhere: sql`${categories.userId} is null`,
      set: {
        names: sql`excluded.names`,
        icon: sql`excluded.icon`,
        color: sql`excluded.color`,
        group: sql`excluded."group"`,
        position: sql`excluded.position`,
        updatedAt: sql`now()`,
      },
    });
  console.info(`Seeded ${defaultCategories.length} default categories.`);
} finally {
  await client.end();
}
