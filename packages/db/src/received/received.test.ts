import { randomUUID } from "node:crypto";

import { planOnboarding } from "@mizania/core";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getBudget } from "../budget/budget";
import { logExpense } from "../expenses/expenses";
import { saveOnboarding } from "../onboarding/save-onboarding";
import { savePlan } from "../plan/month-plan";
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
import {
  getReceiveOptions,
  moveExpectedDate,
  receiveExtraMoney,
  startNewMonth,
  undoExtraMoney,
} from "./received";

let test: TestDatabase;
let n = 0;
const today = "2026-10-11";
const now = new Date("2026-10-11T10:00:00Z");
const payday = "2026-10-31";
const paydayNow = new Date("2026-10-31T10:00:00Z");
let coffee = "";

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
  const [row] = await test.db
    .select({ id: categories.id })
    .from(categories)
    .where(and(isNull(categories.userId), eq(categories.key, "coffee")));
  coffee = row?.id ?? "";
});
afterAll(async () => {
  await test.close();
});

/**
 * Onboarded on Oct 11, money expected on the 31st (20 days): cash 300 and
 * D17 50; rent 100 and STEG 30 to pay, internet already paid, and a 20 DT
 * phone recharge envelope. Daily money: 350 − 150 = 200, so 10 DT a day.
 */
async function student(weeklyMode = false) {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `received${++n}@example.com`, weeklyMode })
    .returning();
  if (!user) throw new Error("no user");
  await saveOnboarding(
    test.db,
    user.id,
    planOnboarding(
      {
        locale: "fr",
        monthlyMillimes: 600_000,
        arrivalDay: 31,
        fixedCosts: [
          { key: "rent", amountMillimes: 100_000, alreadyPaid: false },
          { key: "electricity", amountMillimes: 30_000, alreadyPaid: false },
          { key: "internet", amountMillimes: 35_000, alreadyPaid: true },
          { key: "phone_recharge", amountMillimes: 20_000, alreadyPaid: false },
        ],
        wallets: [
          { kind: "cash", balanceMillimes: 300_000 },
          { kind: "d17", balanceMillimes: 50_000 },
        ],
      },
      today,
    ),
    new Date("2026-10-11T08:00:00Z"),
  );
  const own = await test.db.select().from(wallets).where(eq(wallets.userId, user.id));
  const [cycle] = await test.db.select().from(cycles).where(eq(cycles.userId, user.id));
  return {
    userId: user.id,
    cycleId: cycle?.id ?? "",
    cash: own.find((w) => w.type === "cash")?.id ?? "",
    d17: own.find((w) => w.type === "d17")?.id ?? "",
  };
}

const extra = (walletId: string, amountMillimes: number) => ({
  id: randomUUID(),
  amountMillimes,
  walletId,
  source: "bourse" as const,
});
const todayOf = async (userId: string, day = today) =>
  (await getBudget(test.db, userId, day))?.today;
const weeks = async (cycleId: string) =>
  (
    await test.db
      .select({ index: weekSnapshots.weekIndex, allowance: weekSnapshots.allowanceMillimes })
      .from(weekSnapshots)
      .where(eq(weekSnapshots.cycleId, cycleId))
  ).map((w) => [w.index, w.allowance]);

describe("getReceiveOptions", () => {
  it("offers extra money far from the expected date, and a new month near it", async () => {
    const s = await student();
    const options = await getReceiveOptions(test.db, s.userId, today);
    expect(options).toMatchObject({
      defaultKind: "extra",
      defaultWalletId: s.d17,
      nextExpectedOn: "2026-10-31",
      leftover: 350_000,
      groceriesLastMonth: 0,
    });
    expect(options?.copy).toHaveLength(4);
    expect(options?.copy.map((i) => i.id)).not.toContain(options?.input.planItems[0]?.id);
    expect((await getReceiveOptions(test.db, s.userId, "2026-10-27"))?.defaultKind).toBe("month");
  });

  it("prefers the wallet that last received money, and is null without a month", async () => {
    const s = await student();
    await receiveExtraMoney(test.db, s.userId, extra(s.cash, 10_000), today, now);
    expect((await getReceiveOptions(test.db, s.userId, today))?.defaultWalletId).toBe(s.cash);

    const [user] = await test.db
      .insert(users)
      .values({ name: "New", email: `received${++n}@example.com` })
      .returning();
    expect(await getReceiveOptions(test.db, user?.id ?? "", today)).toBeNull();
  });
});

describe("receiveExtraMoney", () => {
  it("records the money with its source; today's amount goes up at once in normal mode", async () => {
    const s = await student();
    const input = extra(s.d17, 60_000);
    expect(await receiveExtraMoney(test.db, s.userId, input, today, now)).toBe("saved");
    const [row] = await test.db.select().from(transactions).where(eq(transactions.id, input.id));
    expect(row).toMatchObject({
      type: "income",
      cycleId: s.cycleId,
      walletId: s.d17,
      amountMillimes: 60_000,
      incomeSource: "bourse",
    });
    // 260 over 20 days.
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 13_000 });

    // A retry saves nothing more.
    expect(await receiveExtraMoney(test.db, s.userId, input, today, now)).toBe("saved");
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 13_000 });
  });

  it("is undone, once", async () => {
    const s = await student();
    const input = extra(s.d17, 60_000);
    await receiveExtraMoney(test.db, s.userId, input, today, now);
    expect(await undoExtraMoney(test.db, s.userId, input.id, today, now)).toBe("done");
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 10_000 });
    expect(await undoExtraMoney(test.db, s.userId, input.id, today, now)).toBe("not-found");
  });

  it("weekly mode: a week above 0 stays; a week stored at 0 is rebuilt with the money", async () => {
    const s = await student(true);
    // 200 × 7 / 20 = 70 DT for the week, 10 a day.
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 10_000 });
    const sixty = extra(s.d17, 60_000);
    await receiveExtraMoney(test.db, s.userId, sixty, today, now);
    expect(await weeks(s.cycleId)).toEqual([[0, 70_000]]);
    // Not in this week's amount: it shows from next week.
    expect((await getBudget(test.db, s.userId, today))?.waiting).toEqual([
      { id: sixty.id, amountMillimes: 60_000 },
    ]);
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 10_000 });

    // Over budget: 500 DT of savings, the week at 0.
    const editor = await getReceiveOptions(test.db, s.userId, today);
    const items = (editor?.input.planItems ?? []).map(
      ({ id, kind, categoryId, amountMillimes }) => ({
        id,
        kind,
        categoryId,
        amountMillimes,
      }),
    );
    const savings = {
      id: randomUUID(),
      kind: "savings" as const,
      categoryId: null,
      amountMillimes: 500_000,
    };
    await savePlan(
      test.db,
      s.userId,
      { cycleId: s.cycleId, items: [...items, savings] },
      today,
      now,
    );
    await test.db
      .update(weekSnapshots)
      .set({ allowanceMillimes: 0 })
      .where(eq(weekSnapshots.cycleId, s.cycleId));
    expect(await todayOf(s.userId)).toMatchObject({ status: "over_budget", allowance: 0 });

    // 300 DT more: 260 + 300 − 500 = 60 DT of daily money: 21 for the week, 3 a day.
    const bourse = extra(s.cash, 300_000);
    await receiveExtraMoney(test.db, s.userId, bourse, today, now);
    expect(await weeks(s.cycleId)).toEqual([[0, 21_000]]);
    // The week was rebuilt with all of it: nothing waits.
    expect((await getBudget(test.db, s.userId, today))?.waiting).toEqual([]);
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 3_000, status: "on_track" });

    // Undone: back to the lower amount the plan allows, 0.
    await undoExtraMoney(test.db, s.userId, bourse.id, today, now);
    expect(await weeks(s.cycleId)).toEqual([[0, 0]]);
  });

  it("refuses a wallet that isn't the user's or is archived", async () => {
    const s = await student();
    const other = await student();
    expect(await receiveExtraMoney(test.db, s.userId, extra(other.d17, 1_000), today, now)).toBe(
      "not-found",
    );
    await test.db.update(wallets).set({ archived: true }).where(eq(wallets.id, s.d17));
    expect(await receiveExtraMoney(test.db, s.userId, extra(s.d17, 1_000), today, now)).toBe(
      "not-found",
    );
  });
});

describe("startNewMonth", () => {
  async function newMonth(s: Awaited<ReturnType<typeof student>>) {
    const options = await getReceiveOptions(test.db, s.userId, payday);
    return {
      cycleId: s.cycleId,
      incomeId: randomUUID(),
      amountMillimes: 600_000,
      walletId: s.d17,
      source: "parents" as const,
      expectedNextOn: "2026-11-30",
      items: options?.copy ?? [],
    };
  }

  it("ends this month, starts a new one with the money and the plan; this morning's spending stays", async () => {
    const s = await student();
    // A coffee on the morning the money arrives: last month's.
    await logExpense(
      test.db,
      s.userId,
      { id: randomUUID(), amountMillimes: 2_000, categoryId: coffee, walletId: s.cash },
      new Date("2026-10-31T07:00:00Z"),
    );
    const input = await newMonth(s);
    expect(await startNewMonth(test.db, s.userId, input, payday, paydayNow)).toBe("saved");

    const months = await test.db.select().from(cycles).where(eq(cycles.userId, s.userId));
    expect(months.find((c) => c.id === s.cycleId)).toMatchObject({
      status: "closed",
      actualEndOn: payday,
    });
    const month = months.find((c) => c.id !== s.cycleId);
    expect(month).toMatchObject({
      status: "active",
      startedOn: payday,
      expectedNextOn: "2026-11-30",
    });
    const [income] = await test.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, input.incomeId));
    expect(income).toMatchObject({ cycleId: month?.id, incomeSource: "parents" });
    const items = await test.db
      .select()
      .from(planItems)
      .where(eq(planItems.cycleId, month?.id ?? ""));
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.paidAt === null && i.coversFrom === null)).toBe(true);

    // 348 left + 600 − (100 + 30 + 35 + 20) set aside = 763 over 30 days.
    const budget = await getBudget(test.db, s.userId, payday);
    expect(budget?.transferDue).toBe(false);
    expect(budget?.summary).toMatchObject({ available: 948_000, poolNow: 763_000, spentToday: 0 });
    expect(budget?.today).toMatchObject({ allowance: 25_433, spent: 0 });
    expect(budget?.todayExpenses).toEqual([]);

    // A retry changes nothing.
    expect(await startNewMonth(test.db, s.userId, input, payday, paydayNow)).toBe("saved");
    expect(await test.db.select().from(cycles).where(eq(cycles.userId, s.userId))).toHaveLength(2);
  });

  it("weekly mode: stores the new month's first week at once", async () => {
    const s = await student(true);
    const input = await newMonth(s);
    await startNewMonth(test.db, s.userId, input, payday, paydayNow);
    const [month] = await test.db
      .select()
      .from(cycles)
      .where(and(eq(cycles.userId, s.userId), eq(cycles.status, "active")));
    // 350 + 600 − 185 = 765: × 7 / 30 = 178.500.
    expect(await weeks(month?.id ?? "")).toEqual([[0, 178_500]]);
  });

  it("refuses a date too soon, a plan with a category twice, and an ended month", async () => {
    const s = await student();
    const input = await newMonth(s);
    expect(
      await startNewMonth(
        test.db,
        s.userId,
        { ...input, expectedNextOn: payday },
        payday,
        paydayNow,
      ),
    ).toBe("invalid");
    const first = input.items[0];
    if (!first) throw new Error("no item");
    expect(
      await startNewMonth(
        test.db,
        s.userId,
        { ...input, items: [...input.items, { ...first, id: randomUUID() }] },
        payday,
        paydayNow,
      ),
    ).toBe("invalid");

    await startNewMonth(test.db, s.userId, input, payday, paydayNow);
    // The ended month again, with another income ID.
    expect(
      await startNewMonth(
        test.db,
        s.userId,
        { ...input, incomeId: randomUUID() },
        payday,
        paydayNow,
      ),
    ).toBe("not-found");
  });
});

describe("moveExpectedDate", () => {
  it("moves a late transfer to a new date: today's amount comes back", async () => {
    const s = await student();
    expect((await getBudget(test.db, s.userId, payday))?.transferDue).toBe(true);
    const move = (expectedOn: string) =>
      moveExpectedDate(test.db, s.userId, { cycleId: s.cycleId, expectedOn }, payday);

    expect(await move("2026-10-30")).toBe("invalid");
    expect(await move("2027-01-15")).toBe("invalid");
    expect(await move("2026-11-02")).toBe("saved");
    const budget = await getBudget(test.db, s.userId, payday);
    expect(budget?.transferDue).toBe(false);
    // 200 DT over the 2 days left.
    expect(budget?.today).toMatchObject({ allowance: 100_000, daysLeft: 2 });
  });

  it("weekly mode: a later date never raises this week's amount", async () => {
    const s = await student(true);
    expect(await weeks(s.cycleId)).toEqual([]);
    await todayOf(s.userId);
    expect(await weeks(s.cycleId)).toEqual([[0, 70_000]]);
    // Expected on Nov 20: 200 × 7 / 40 = 35 DT for the week.
    await moveExpectedDate(
      test.db,
      s.userId,
      { cycleId: s.cycleId, expectedOn: "2026-11-20" },
      today,
    );
    expect(await weeks(s.cycleId)).toEqual([[0, 35_000]]);
    // Back to Oct 31: 70 rebuilt, but the week keeps 35.
    await moveExpectedDate(
      test.db,
      s.userId,
      { cycleId: s.cycleId, expectedOn: "2026-10-31" },
      today,
    );
    expect(await weeks(s.cycleId)).toEqual([[0, 35_000]]);
  });
});

describe("received money isolation", () => {
  it("B can't receive into A's wallet, undo A's money, start A's month or move A's date", async () => {
    const a = await student();
    const b = await student();
    const money = extra(a.d17, 50_000);
    await receiveExtraMoney(test.db, a.userId, money, today, now);
    const before = await todayOf(a.userId);

    expect(await receiveExtraMoney(test.db, b.userId, extra(a.d17, 1_000), today, now)).toBe(
      "not-found",
    );
    // A's income ID, as B: refused, not a retry.
    expect(
      await receiveExtraMoney(test.db, b.userId, { ...money, walletId: b.d17 }, today, now),
    ).toBe("not-found");
    expect(await undoExtraMoney(test.db, b.userId, money.id, today, now)).toBe("not-found");
    expect(
      await startNewMonth(
        test.db,
        b.userId,
        {
          cycleId: a.cycleId,
          incomeId: randomUUID(),
          amountMillimes: 600_000,
          walletId: b.d17,
          source: "parents",
          expectedNextOn: "2026-11-30",
          items: [],
        },
        payday,
        paydayNow,
      ),
    ).toBe("not-found");
    expect(
      await moveExpectedDate(
        test.db,
        b.userId,
        { cycleId: a.cycleId, expectedOn: "2026-11-05" },
        today,
      ),
    ).toBe("not-found");

    expect(await todayOf(a.userId)).toEqual(before);
    const [month] = await test.db.select().from(cycles).where(eq(cycles.id, a.cycleId));
    expect(month).toMatchObject({ status: "active", expectedNextOn: "2026-10-31" });
  });
});
