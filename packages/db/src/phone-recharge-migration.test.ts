import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { categories, cycles, planItems, transactions, users, wallets } from "./schema";
import { seedDefaultCategories } from "./seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "./test/test-database";

// Migration 0005 runs on databases that already have rows: here it's run
// again after creating rows like the ones onboarding made before the change.
const migration = readFileSync(
  fileURLToPath(new URL("../migrations/0005_phone_recharge_envelope.sql", import.meta.url)),
  "utf8",
);

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
});
afterAll(async () => {
  await test.close();
});

const categoryId = async (key: string) => {
  const [row] = await test.db.select().from(categories).where(eq(categories.key, key));
  return row?.id ?? "";
};

describe("migration 0005: phone recharge becomes an envelope", () => {
  it("converts unpaid phone recharge fixed costs, and leaves everything else", async () => {
    const [user] = await test.db
      .insert(users)
      .values({ name: "Amel", email: "migration5@example.com" })
      .returning();
    const userId = user?.id ?? "";
    const [cycle] = await test.db
      .insert(cycles)
      .values({ userId, startedOn: "2026-10-01", expectedNextOn: "2026-11-01", weeklyMode: true })
      .returning();
    const [wallet] = await test.db.insert(wallets).values({ userId, type: "cash" }).returning();
    const phone = await categoryId("phone_recharge");
    const item = (categoryKey: string, extra: Partial<typeof planItems.$inferInsert> = {}) => ({
      cycleId: cycle?.id ?? "",
      kind: "fixed" as const,
      categoryId: categoryKey,
      amountMillimes: 20_000,
      ...extra,
    });
    const rows = await test.db
      .insert(planItems)
      .values([
        item(phone),
        item(phone, { paidAt: new Date() }),
        item(phone, { deletedAt: new Date() }),
        item(await categoryId("internet")),
        item(phone),
      ])
      .returning({ id: planItems.id });
    const [unpaid, paid, deleted, internet, withPayment] = rows.map((r) => r.id);
    await test.db.insert(transactions).values({
      userId,
      walletId: wallet?.id ?? "",
      planItemId: withPayment,
      categoryId: phone,
      type: "expense",
      amountMillimes: 5_000,
      occurredAt: new Date(),
      source: "plan",
    });

    await test.db.execute(sql.raw(migration));
    await test.db.execute(sql.raw(migration)); // safe to run again

    const kinds = Object.fromEntries(
      (await test.db.select().from(planItems)).map((p) => [p.id, p.kind]),
    );
    expect(kinds).toEqual({
      [unpaid ?? ""]: "envelope",
      [paid ?? ""]: "fixed",
      [deleted ?? ""]: "fixed",
      [internet ?? ""]: "fixed",
      [withPayment ?? ""]: "fixed",
    });
  });
});
