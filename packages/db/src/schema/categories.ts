import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const categoryGroup = pgEnum("category_group", ["fixed", "envelope", "daily", "income"]);

/** Category name in each supported locale. */
export interface CategoryNames {
  ar: string;
  fr: string;
  en: string;
}

export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    // null = a default category shared by everyone.
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    key: text().notNull(),
    names: jsonb().$type<CategoryNames>().notNull(),
    icon: text().notNull(),
    color: text().notNull(),
    group: categoryGroup().notNull(),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("categories_default_key_unique")
      .on(t.key)
      .where(sql`${t.userId} is null`),
    uniqueIndex("categories_user_key_unique")
      .on(t.userId, t.key)
      .where(sql`${t.userId} is not null`),
    index("categories_user_id_idx").on(t.userId),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
