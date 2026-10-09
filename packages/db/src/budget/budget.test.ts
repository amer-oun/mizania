import { type OnboardingAnswers, planOnboarding, todayBudget } from "@mizania/core";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { saveOnboarding } from "../onboarding/save-onboarding";
import {
  categories,
  cycles,
  planItems,
  transactions,
  users,
  wallets,
  weekSnapshots,
} from "../schema";
import { seedDefaultCategories } from "../seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "../test/test-database";
import { archiveWallet } from "../wallets/wallets";
import { getBudget } from "./budget";

let test: TestDatabase;
let n = 0;

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
});
afterAll(async () => {
  await test.close();
});

// Onboarded on Oct 1, money expected on the 31st: 30 days, weeks of 7.
const answers: OnboardingAnswers = {
  locale: "fr",
  monthlyMillimes: 600_000,
  arrivalDay: 31,
  fixedCosts: [{ key: "rent", amountMillimes: 250_000, alreadyPaid: false }],
  wallets: [
    { kind: "cash", balanceMillimes: 100_000 },
    { kind: "card", balanceMillimes: 450_000 },
  ],
};

async function student(weeklyMode = true) {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `budget${++n}@example.com`, weeklyMode })
    .returning();
  if (!user) throw new Error("no user");
  await saveOnboarding(
    test.db,
    user.id,
    planOnboarding(answers, "2026-10-01"),
    new Date("2026-10-01T09:00:00Z"),
  );
  const userWallets = await test.db.select().from(wallets).where(eq(wallets.userId, user.id));
  const walletId = (type: string) => userWallets.find((w) => w.type === type)?.id ?? "";
  const [cycle] = await test.db.select().from(cycles).where(eq(cycles.userId, user.id));
  return {
    userId: user.id,
    cash: walletId("cash"),
    card: walletId("card"),
    cycleId: cycle?.id ?? "",
  };
}

async function categoryId(key: string) {
  const [row] = await test.db.select().from(categories).where(eq(categories.key, key));
  return row?.id ?? "";
}

async function spend(userId: string, walletId: string, amountMillimes: number, at: string) {
  await test.db.insert(transactions).values({
    userId,
    walletId,
    categoryId: await categoryId("coffee"),
    type: "expense",
    amountMillimes,
    occurredAt: new Date(at),
    source: "quick",
  });
}

const snapshotsOf = (cycleId: string) =>
  test.db.select().from(weekSnapshots).where(eq(weekSnapshots.cycleId, cycleId));

describe("getBudget", () => {
  it("computes today's amount from the wallets and unpaid fixed costs", async () => {
    const { userId } = await student(false);
    const budget = await getBudget(test.db, userId, "2026-10-01");

    expect(budget?.cycle).toMatchObject({
      startedOn: "2026-10-01",
      expectedNextOn: "2026-10-31",
      weeklyMode: false,
    });
    expect(budget?.summary).toMatchObject({
      available: 550_000,
      reserved: { fixed: 250_000, envelopes: 0, savings: 0, total: 250_000 },
      poolNow: 300_000,
      spentToday: 0,
    });
    // 300 DT over 30 days.
    expect(budget?.today).toMatchObject({ allowance: 10_000, left: 10_000, daysLeft: 30 });
    expect(budget?.transferDue).toBe(false);
  });

  it("counts spending on its day in Tunisia", async () => {
    const { userId, cash } = await student(false);
    // 23:30 UTC on Oct 4 is 00:30 on Oct 5 in Tunis.
    await spend(userId, cash, 3_000, "2026-10-04T23:30:00Z");

    const oct4 = await getBudget(test.db, userId, "2026-10-04");
    const oct5 = await getBudget(test.db, userId, "2026-10-05");
    expect(oct4?.summary.spendingByDay.at(-1)).toEqual({ day: "2026-10-04", amount: 0 });
    expect(oct5?.summary.spentToday).toBe(3_000);
    expect(oct5?.today.left).toBe(oct5 ? oct5.today.allowance - 3_000 : NaN);
  });

  it("treats archived money as gone: today's amount stays, what's left drops", async () => {
    const { userId, cash } = await student(false);
    const before = await getBudget(test.db, userId, "2026-10-01");
    await archiveWallet(test.db, userId, cash, { kind: "zero" }, new Date("2026-10-01T15:00:00Z"));
    const after = await getBudget(test.db, userId, "2026-10-01");

    expect(after?.today.allowance).toBe(before?.today.allowance);
    expect(after?.today.left).toBe(10_000 - 100_000);
    expect(after?.today.status).toBe("over_today");
  });

  it("says when the expected transfer date has come", async () => {
    const { userId } = await student(false);
    expect((await getBudget(test.db, userId, "2026-10-31"))?.transferDue).toBe(true);
  });

  it("returns null without an active cycle", async () => {
    const [user] = await test.db
      .insert(users)
      .values({ name: "New", email: `budget${++n}@example.com` })
      .returning();
    expect(await getBudget(test.db, user?.id ?? "", "2026-10-01")).toBeNull();
  });
});

describe("getBudget in weekly mode", () => {
  it("stores this week's amount once, even with parallel requests", async () => {
    const { userId, cycleId } = await student();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => getBudget(test.db, userId, "2026-10-01")),
    );
    // 300 DT × 7 / 30 = 70 DT this week, 10 DT a day.
    for (const result of results) {
      expect(result?.today.week).toMatchObject({ index: 0, allowance: 70_000, daysLeft: 7 });
      expect(result?.today.allowance).toBe(10_000);
    }
    expect(await snapshotsOf(cycleId)).toMatchObject([
      { weekIndex: 0, startsOn: "2026-10-01", endsOn: "2026-10-07", allowanceMillimes: 70_000 },
    ]);
  });

  it("keeps the week's amount when the plan changes mid-week, then stores the next week", async () => {
    const { userId, cycleId } = await student();
    await getBudget(test.db, userId, "2026-10-01");

    // On Oct 3 she plans a 60 DT groceries envelope: the daily money drops.
    await test.db.insert(planItems).values({
      cycleId,
      kind: "envelope",
      categoryId: await categoryId("groceries"),
      amountMillimes: 60_000,
    });
    const oct3 = await getBudget(test.db, userId, "2026-10-03");
    expect(oct3?.summary.poolNow).toBe(240_000);
    expect(oct3?.today.week?.allowance).toBe(70_000);
    expect(oct3?.today.allowance).toBe(14_000); // 70 DT over the 5 days left

    // Week 2 starts from the new numbers: 240 DT × 7 / 23.
    const oct8 = await getBudget(test.db, userId, "2026-10-08");
    expect(oct8?.today.week).toMatchObject({ index: 1, allowance: 73_043 });
    expect((await snapshotsOf(cycleId)).map((s) => s.weekIndex).sort()).toEqual([0, 1]);
  });

  it("matches todayBudget with the stored amount", async () => {
    const { userId, cash } = await student();
    await getBudget(test.db, userId, "2026-10-02");
    await spend(userId, cash, 12_000, "2026-10-03T10:00:00Z");
    const budget = await getBudget(test.db, userId, "2026-10-04");
    if (!budget) throw new Error("no budget");
    expect(budget.today).toEqual(
      todayBudget({
        today: "2026-10-04",
        startedOn: "2026-10-01",
        nextTransferOn: "2026-10-31",
        poolNow: budget.summary.poolNow,
        spentToday: 0,
        spentThisWeekBeforeToday: 12_000,
        weeklyMode: true,
        weekAllowance: 70_000,
      }),
    );
  });

  it("stores nothing in normal mode", async () => {
    const { userId, cycleId } = await student(false);
    await getBudget(test.db, userId, "2026-10-01");
    expect(await snapshotsOf(cycleId)).toEqual([]);
  });
});

// Required (CLAUDE.md): one student's data never reaches another's budget.
describe("isolation between users", () => {
  it("B's budget ignores A's wallets, plan, spending and snapshots", async () => {
    const a = await student();
    const b = await student();
    await spend(a.userId, a.cash, 50_000, "2026-10-01T10:00:00Z");
    await test.db.insert(planItems).values({
      cycleId: a.cycleId,
      kind: "savings",
      name: "Laptop",
      amountMillimes: 100_000,
    });
    await getBudget(test.db, a.userId, "2026-10-01");
    await test.db
      .update(weekSnapshots)
      .set({ allowanceMillimes: 1 })
      .where(eq(weekSnapshots.cycleId, a.cycleId));

    const budget = await getBudget(test.db, b.userId, "2026-10-01");
    expect(budget?.cycle.id).toBe(b.cycleId);
    expect(budget?.summary).toMatchObject({ available: 550_000, poolNow: 300_000, spentToday: 0 });
    expect(budget?.today.week?.allowance).toBe(70_000);
    const bSnapshots = await test.db
      .select()
      .from(weekSnapshots)
      .where(and(eq(weekSnapshots.userId, b.userId), eq(weekSnapshots.cycleId, b.cycleId)));
    expect(bSnapshots).toHaveLength(1);
  });

  it("a snapshot can't be stored on another user's cycle", async () => {
    const a = await student();
    const b = await student();
    await expect(
      test.db.insert(weekSnapshots).values({
        userId: b.userId,
        cycleId: a.cycleId,
        weekIndex: 3,
        startsOn: "2026-10-22",
        endsOn: "2026-10-28",
        allowanceMillimes: 1,
      }),
    ).rejects.toThrow();
  });
});
