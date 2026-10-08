import { asc, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "./migrations";
import { categories, users } from "./schema";
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
  it("create the app and auth tables in an empty database", async () => {
    const rows = await test.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual([
      "accounts",
      "categories",
      "cycles",
      "plan_items",
      "rate_limits",
      "sessions",
      "transactions",
      "users",
      "verifications",
      "wallets",
    ]);
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

describe("users", () => {
  it("default to Arabic, weekly mode on and a 21:00 check-in", async () => {
    const [user] = await test.db
      .insert(users)
      .values({ name: "Amel", email: "amel@example.com" })
      .returning();

    expect(user).toMatchObject({
      locale: "ar",
      weeklyMode: true,
      checkinTime: "21:00:00",
      emailVerified: false,
      deletedAt: null,
    });
  });

  it("reject an unknown locale", async () => {
    await expect(
      test.db.execute(
        sql`insert into users (name, email, locale) values ('X', 'x@example.com', 'de')`,
      ),
    ).rejects.toThrow();
  });

  it("own their categories: user_id must point to a user, and deleting the user deletes them", async () => {
    const [user] = await test.db
      .insert(users)
      .values({ name: "Sami", email: "sami@example.com" })
      .returning();
    if (!user) throw new Error("no user");
    const own = {
      names: { ar: "x", fr: "x", en: "x" },
      icon: "x",
      color: "#000",
      group: "daily",
    } as const;

    await expect(
      test.db.insert(categories).values({ ...own, key: "ghost", userId: crypto.randomUUID() }),
    ).rejects.toThrow();

    await test.db.insert(categories).values({ ...own, key: "mine", userId: user.id });
    await test.db.execute(sql`delete from users where id = ${user.id}`);
    const left = await test.db.execute(sql`select 1 from categories where key = 'mine'`);
    expect(left).toHaveLength(0);
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
