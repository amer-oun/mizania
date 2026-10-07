import { asc, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "./migrations";
import { categories } from "./schema";
import { defaultCategories } from "./seed/default-categories";
import { seedDefaultCategories } from "./seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "./test/test-database";

// Integration tests against a real Postgres (Testcontainers).

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase(); // already migrated
});

afterAll(async () => {
  await test.close();
});

describe("migrations", () => {
  it("create the categories table in an empty database", async () => {
    const rows = await test.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    expect(rows.map((r) => r.table_name)).toContain("categories");
  });

  it("do nothing when run again", async () => {
    const count = () =>
      test.db.execute<{ n: number }>(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
    const before = (await count())[0]?.n;
    await runMigrations(test.db);
    expect((await count())[0]?.n).toBe(before);
  });
});

describe("seedDefaultCategories", () => {
  const readDefaults = () =>
    test.db
      .select()
      .from(categories)
      .where(isNull(categories.userId))
      .orderBy(asc(categories.position));

  it("inserts the 15 default categories with their AR/FR/EN names", async () => {
    expect(await seedDefaultCategories(test.db)).toBe(15);

    const rows = await readDefaults();
    expect(rows).toHaveLength(15);
    expect(rows.map((r) => r.key)).toEqual(defaultCategories.map((c) => c.key));
    expect(rows.map((r) => r.names)).toEqual(defaultCategories.map((c) => c.names));
  });

  it("is safe to run again: same rows, updated in place", async () => {
    const before = await readDefaults();
    await seedDefaultCategories(test.db);
    const after = await readDefaults();

    expect(after).toHaveLength(15);
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
  });
});
