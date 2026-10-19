import { randomUUID } from "node:crypto";

import { planOnboarding } from "@mizania/core";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { saveOnboarding } from "../onboarding/save-onboarding";
import { startNewMonth } from "../received/received";
import { categories, cycles, planItems, transactions, users, wallets } from "../schema";
import { seedDefaultCategories } from "../seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "../test/test-database";
import { getMonthByCategory } from "./insights";

let test: TestDatabase;
let n = 0;
const ids: Record<string, string> = {};

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
  const rows = await test.db
    .select({ id: categories.id, key: categories.key })
    .from(categories)
    .where(isNull(categories.userId));
  for (const row of rows) ids[row.key] = row.id;
});
afterAll(async () => {
  await test.close();
});

/** Onboarded on Sep 1, money expected on Oct 1: rent 250 to pay, 550 in cash. */
async function student() {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `insights${++n}@example.com` })
    .returning();
  if (!user) throw new Error("no user");
  await saveOnboarding(
    test.db,
    user.id,
    planOnboarding(
      {
        locale: "fr",
        monthlyMillimes: 600_000,
        arrivalDay: 1,
        fixedCosts: [{ key: "rent", amountMillimes: 250_000, alreadyPaid: false }],
        wallets: [{ kind: "cash", balanceMillimes: 550_000 }],
      },
      "2026-09-01",
    ),
    new Date("2026-09-01T08:00:00Z"),
  );
  const [wallet] = await test.db.select().from(wallets).where(eq(wallets.userId, user.id));
  const [cycle] = await test.db.select().from(cycles).where(eq(cycles.userId, user.id));
  const [rent] = await test.db
    .select()
    .from(planItems)
    .where(eq(planItems.cycleId, cycle?.id ?? ""));
  return {
    userId: user.id,
    cash: wallet?.id ?? "",
    cycleId: cycle?.id ?? "",
    rentItem: rent?.id ?? "",
  };
}

type Student = Awaited<ReturnType<typeof student>>;

async function spend(
  s: Student,
  cycleId: string,
  key: string | null,
  amountMillimes: number,
  at: string,
  extra: { planItemId?: string; source?: "quick" | "plan" | "checkin" } = {},
) {
  await test.db.insert(transactions).values({
    userId: s.userId,
    cycleId,
    walletId: s.cash,
    categoryId: key ? ids[key] : null,
    planItemId: extra.planItemId ?? null,
    type: "expense",
    amountMillimes,
    occurredAt: new Date(at),
    source: extra.source ?? "quick",
  });
}

async function newMonth(s: Student) {
  expect(
    await startNewMonth(
      test.db,
      s.userId,
      {
        cycleId: s.cycleId,
        incomeId: randomUUID(),
        amountMillimes: 600_000,
        walletId: s.cash,
        source: "parents",
        expectedNextOn: "2026-11-01",
        items: [],
      },
      "2026-10-01",
      new Date("2026-10-01T12:00:00Z"),
    ),
  ).toBe("saved");
  const [active] = await test.db
    .select()
    .from(cycles)
    .where(and(eq(cycles.userId, s.userId), eq(cycles.status, "active")));
  return active?.id ?? "";
}

describe("getMonthByCategory", () => {
  it("a first month: everything spent by category, with nothing to compare", async () => {
    const s = await student();
    await spend(s, s.cycleId, "rent", 250_000, "2026-09-02T10:00:00Z", {
      planItemId: s.rentItem,
      source: "plan",
    });
    await spend(s, s.cycleId, "coffee", 2_000, "2026-09-03T08:00:00Z");
    await spend(s, s.cycleId, "coffee", 3_000, "2026-09-05T08:00:00Z");
    await spend(s, s.cycleId, null, 8_000, "2026-09-05T18:00:00Z", { source: "checkin" });
    // Deleted spending and another student's don't count.
    await test.db.insert(transactions).values({
      userId: s.userId,
      cycleId: s.cycleId,
      walletId: s.cash,
      categoryId: ids.coffee,
      type: "expense",
      amountMillimes: 40_000,
      occurredAt: new Date("2026-09-04T08:00:00Z"),
      source: "quick",
      deletedAt: new Date("2026-09-04T09:00:00Z"),
    });
    const other = await student();
    await spend(other, other.cycleId, "coffee", 99_000, "2026-09-03T08:00:00Z");

    const result = await getMonthByCategory(test.db, s.userId, "2026-09-05");
    expect(result?.month).toEqual({
      day: 5,
      total: 263_000,
      lastMonthTotal: null,
      lastMonthWhole: false,
      rows: [
        { categoryId: ids.rent, spent: 250_000, lastMonth: null },
        { categoryId: null, spent: 8_000, lastMonth: null },
        { categoryId: ids.coffee, spent: 5_000, lastMonth: null },
      ],
    });
    expect(result?.categories.map((c) => c.key).sort()).toEqual(["coffee", "rent"]);
    expect(result?.categories.find((c) => c.key === "rent")?.group).toBe("fixed");
  });

  it("a later month: compared with last month on the same day", async () => {
    const s = await student();
    await spend(s, s.cycleId, "coffee", 20_000, "2026-09-05T08:00:00Z");
    await spend(s, s.cycleId, "coffee", 9_000, "2026-09-14T08:00:00Z"); // day 14
    await spend(s, s.cycleId, "transport", 15_000, "2026-09-03T08:00:00Z");
    // The morning the money arrived: last month's.
    await spend(s, s.cycleId, "coffee", 1_000, "2026-10-01T07:00:00Z");
    const october = await newMonth(s);
    await spend(s, october, "coffee", 45_000, "2026-10-04T08:00:00Z");
    await spend(s, october, "coffee", 2_000, "2026-10-01T15:00:00Z");

    const result = await getMonthByCategory(test.db, s.userId, "2026-10-12");
    expect(result?.cycle.id).toBe(october);
    expect(result?.month).toEqual({
      day: 12,
      total: 47_000,
      lastMonthTotal: 35_000,
      lastMonthWhole: false,
      rows: [
        { categoryId: ids.coffee, spent: 47_000, lastMonth: 20_000 },
        { categoryId: ids.transport, spent: 0, lastMonth: 15_000 },
      ],
    });
  });

  it("returns null without an active month", async () => {
    const [user] = await test.db
      .insert(users)
      .values({ name: "New", email: `insights${++n}@example.com` })
      .returning();
    expect(await getMonthByCategory(test.db, user?.id ?? "", "2026-10-01")).toBeNull();
  });
});
