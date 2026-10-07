import { sql } from "drizzle-orm";

import type { Db } from "../client";
import { categories } from "../schema";
import { defaultCategories } from "./default-categories";

/**
 * Inserts the default categories (user_id = null), or updates them in place
 * when they already exist. Safe to run any number of times.
 * Returns how many default categories were written.
 */
export async function seedDefaultCategories(db: Db): Promise<number> {
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
  return defaultCategories.length;
}
