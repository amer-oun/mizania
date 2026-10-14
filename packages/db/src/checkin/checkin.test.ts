import { randomUUID } from "node:crypto";

import { planOnboarding } from "@mizania/core";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getBudget } from "../budget/budget";
import { logExpense } from "../expenses/expenses";
import { saveOnboarding } from "../onboarding/save-onboarding";
import { categories, checkins, transactions, users, wallets, weekSnapshots } from "../schema";
import { seedDefaultCategories } from "../seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "../test/test-database";
import { categorizeUnlogged, getCheckinState, saveCheckIn, undoCheckIn } from "./checkin";

let test: TestDatabase;
let n = 0;
const today = "2026-10-11";
/** A time today in Tunis (UTC+1). */
const at = (time: string) => new Date(`2026-10-11T${time}:00+01:00`);
const category: Record<string, string> = {};

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
  const rows = await test.db
    .select({ id: categories.id, key: categories.key })
    .from(categories)
    .where(isNull(categories.userId));
  for (const row of rows) category[row.key] = row.id;
});
afterAll(async () => {
  await test.close();
});

/**
 * Onboarded on Oct 11 at 08:00, money expected on the 31st (20 days): cash
 * 300 and D17 50, rent 150 to pay. Daily money: 200, so 10 DT a day.
 */
async function student(weeklyMode = false) {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `checkin${++n}@example.com`, weeklyMode })
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
        fixedCosts: [{ key: "rent", amountMillimes: 150_000, alreadyPaid: false }],
        wallets: [
          { kind: "d17", balanceMillimes: 50_000 },
          { kind: "cash", balanceMillimes: 300_000 },
        ],
      },
      today,
    ),
    at("08:00"),
  );
  const own = await test.db.select().from(wallets).where(eq(wallets.userId, user.id));
  return {
    userId: user.id,
    cash: own.find((w) => w.type === "cash")?.id ?? "",
    d17: own.find((w) => w.type === "d17")?.id ?? "",
  };
}

const count = (walletId: string, countedMillimes: number, extra = {}) => ({
  id: randomUUID(),
  walletId,
  countedMillimes,
  ...extra,
});
const budgetOf = (userId: string) => getBudget(test.db, userId, today);
const balance = async (userId: string) => (await budgetOf(userId))?.summary.available;

describe("getCheckinState", () => {
  it("opens the card from 18:00, lists cash first, and knows when cash was counted", async () => {
    const s = await student();
    const afternoon = await getCheckinState(test.db, s.userId, today, at("17:00"));
    expect(afternoon).toMatchObject({
      evening: false,
      cashWalletId: s.cash,
      cashCountedToday: false,
    });
    expect(afternoon.wallets.map((w) => [w.id, w.last])).toEqual([
      [s.cash, null],
      [s.d17, null],
    ]);

    await saveCheckIn(test.db, s.userId, count(s.cash, 300_000), today, at("19:00"));
    const evening = await getCheckinState(test.db, s.userId, today, at("19:05"));
    expect(evening).toMatchObject({ evening: true, cashCountedToday: true });
    expect(evening.wallets[0]?.last).toMatchObject({
      day: today,
      kind: "match",
      amountMillimes: 0,
    });
  });

  it("opens earlier at the student's own earlier check-in time", async () => {
    const s = await student();
    await test.db.update(users).set({ checkinTime: "16:00" }).where(eq(users.id, s.userId));
    expect((await getCheckinState(test.db, s.userId, today, at("16:30"))).evening).toBe(true);
  });
});

describe("saveCheckIn", () => {
  it("an exact count records only the check-in", async () => {
    const s = await student();
    const result = await saveCheckIn(test.db, s.userId, count(s.cash, 300_000), today, at("19:00"));
    expect(result).toEqual({
      status: "saved",
      kind: "match",
      amountMillimes: 0,
      transactionId: null,
      since: null,
      nextWeek: false,
    });
    expect(await balance(s.userId)).toBe(350_000);
  });

  it("less cash: unlogged spending since the last count lowers what's left today, not today's amount", async () => {
    const s = await student();
    const first = await saveCheckIn(test.db, s.userId, count(s.cash, 292_000), today, at("19:00"));
    expect(first).toMatchObject({
      status: "saved",
      kind: "unlogged_spending",
      amountMillimes: 8_000,
      since: null,
    });
    const [row] = await test.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, first.status === "saved" ? (first.transactionId ?? "") : ""));
    expect(row).toMatchObject({
      type: "expense",
      source: "checkin",
      categoryId: null,
      walletId: s.cash,
    });
    expect((await budgetOf(s.userId))?.today).toMatchObject({ allowance: 10_000, left: 2_000 });

    // Counted again: only what changed since.
    const again = await saveCheckIn(test.db, s.userId, count(s.cash, 292_000), today, at("20:00"));
    expect(again).toMatchObject({ kind: "match", since: at("19:00") });
    await saveCheckIn(test.db, s.userId, count(s.cash, 290_000), today, at("21:00"));
    const rows = (await budgetOf(s.userId))?.todayExpenses ?? [];
    expect(rows.map((r) => [r.amountMillimes, r.unlogged])).toEqual([
      [2_000, { since: at("20:00") }],
      [8_000, { since: null }],
    ]);
    expect(await balance(s.userId)).toBe(340_000);
  });

  it("more cash: asks first, then records income or a correction", async () => {
    const s = await student();
    const more = count(s.cash, 305_000);
    expect(await saveCheckIn(test.db, s.userId, more, today, at("19:00"))).toEqual({
      status: "needs-answer",
      amountMillimes: 5_000,
    });
    expect(await test.db.select().from(checkins).where(eq(checkins.userId, s.userId))).toEqual([]);

    // Answered for a difference that has changed meanwhile.
    expect(
      await saveCheckIn(
        test.db,
        s.userId,
        { ...more, answer: "income", seenMillimes: 4_000 },
        today,
        at("19:01"),
      ),
    ).toEqual({ status: "changed", kind: "unlogged_income", amountMillimes: 5_000 });

    const income = await saveCheckIn(
      test.db,
      s.userId,
      { ...more, answer: "income", source: "parents", seenMillimes: 5_000 },
      today,
      at("19:02"),
    );
    expect(income).toMatchObject({
      status: "saved",
      kind: "unlogged_income",
      amountMillimes: 5_000,
    });
    const [row] = await test.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, income.status === "saved" ? (income.transactionId ?? "") : ""));
    expect(row).toMatchObject({ type: "income", incomeSource: "parents", source: "checkin" });
    // Not spending: today's amount goes up at once in normal mode.
    expect((await budgetOf(s.userId))?.today).toMatchObject({ allowance: 10_250, left: 10_250 });

    const correction = await saveCheckIn(
      test.db,
      s.userId,
      count(s.cash, 308_000, { answer: "correction", seenMillimes: 3_000 }),
      today,
      at("20:00"),
    );
    expect(correction).toMatchObject({ status: "saved", amountMillimes: 3_000 });
    expect(await balance(s.userId)).toBe(358_000);
  });

  it("is safe to retry", async () => {
    const s = await student();
    const input = count(s.cash, 292_000);
    const first = await saveCheckIn(test.db, s.userId, input, today, at("19:00"));
    expect(await saveCheckIn(test.db, s.userId, input, today, at("19:01"))).toEqual(first);
    expect(await balance(s.userId)).toBe(342_000);
  });

  it("weekly mode: more cash leaves a week above 0 as it is", async () => {
    const s = await student(true);
    // 200 × 7 / 20 = 70 DT for the week.
    expect((await budgetOf(s.userId))?.today).toMatchObject({ allowance: 10_000 });
    const found = await saveCheckIn(
      test.db,
      s.userId,
      count(s.cash, 320_000, { answer: "correction", seenMillimes: 20_000 }),
      today,
      at("19:00"),
    );
    // "+20 DT · shows in your daily amount from next week".
    expect(found).toMatchObject({ status: "saved", nextWeek: true });
    expect((await budgetOf(s.userId))?.waiting).toEqual([
      { id: found.status === "saved" ? found.transactionId : "", amountMillimes: 20_000 },
    ]);
    const weeks = await test.db.select().from(weekSnapshots);
    expect(weeks.filter((w) => w.userId === s.userId).map((w) => w.allowanceMillimes)).toEqual([
      70_000,
    ]);
    expect((await budgetOf(s.userId))?.today).toMatchObject({ allowance: 10_000 });
  });
});

describe("undoCheckIn", () => {
  it("undoes the latest check-in of a wallet only, with its transaction", async () => {
    const s = await student();
    const first = count(s.cash, 292_000);
    const second = count(s.cash, 290_000);
    await saveCheckIn(test.db, s.userId, first, today, at("19:00"));
    await saveCheckIn(test.db, s.userId, second, today, at("20:00"));
    expect(await balance(s.userId)).toBe(340_000);

    expect(await undoCheckIn(test.db, s.userId, first.id, today, at("20:30"))).toBe("not-latest");
    expect(await undoCheckIn(test.db, s.userId, second.id, today, at("20:31"))).toBe("done");
    expect(await balance(s.userId)).toBe(342_000);
    expect(await undoCheckIn(test.db, s.userId, second.id, today, at("20:32"))).toBe("not-found");
    // Now the first is the latest.
    expect(await undoCheckIn(test.db, s.userId, first.id, today, at("20:33"))).toBe("done");
    expect(await balance(s.userId)).toBe(350_000);
    expect((await getCheckinState(test.db, s.userId, today, at("21:00"))).cashCountedToday).toBe(
      false,
    );
  });

  it("refuses when the wallet is archived", async () => {
    const s = await student();
    const input = count(s.d17, 45_000);
    await saveCheckIn(test.db, s.userId, input, today, at("19:00"));
    await test.db.update(wallets).set({ archived: true }).where(eq(wallets.id, s.d17));
    expect(await undoCheckIn(test.db, s.userId, input.id, today, at("19:30"))).toBe(
      "wallet-archived",
    );
  });
});

describe("categorizeUnlogged", () => {
  it("gives unlogged spending a daily or envelope category, nothing else", async () => {
    const s = await student();
    const result = await saveCheckIn(test.db, s.userId, count(s.cash, 292_000), today, at("19:00"));
    const id = result.status === "saved" ? (result.transactionId ?? "") : "";
    const pick = (key: string, transactionId = id) =>
      categorizeUnlogged(test.db, s.userId, { transactionId, categoryId: category[key] ?? "" });

    expect(await pick("rent")).toBe("invalid");
    expect(await pick("coffee")).toBe("saved");
    const [row] = await test.db.select().from(transactions).where(eq(transactions.id, id));
    expect(row?.categoryId).toBe(category.coffee);

    // A quick-log expense isn't unlogged spending.
    const logged = randomUUID();
    await logExpense(
      test.db,
      s.userId,
      { id: logged, amountMillimes: 1_000, categoryId: category.coffee ?? "", walletId: s.cash },
      at("19:10"),
    );
    expect(await pick("transport", logged)).toBe("not-found");
  });
});

describe("check-in isolation", () => {
  it("B can't count A's wallet, reuse A's check-in, undo it or categorize A's spending", async () => {
    const a = await student();
    const b = await student();
    const mine = count(a.cash, 292_000);
    const saved = await saveCheckIn(test.db, a.userId, mine, today, at("19:00"));
    const transactionId = saved.status === "saved" ? (saved.transactionId ?? "") : "";

    expect(await saveCheckIn(test.db, b.userId, count(a.cash, 1_000), today, at("19:10"))).toEqual({
      status: "not-found",
    });
    expect(
      await saveCheckIn(test.db, b.userId, { ...mine, walletId: b.cash }, today, at("19:11")),
    ).toEqual({ status: "not-found" });
    expect(await undoCheckIn(test.db, b.userId, mine.id, today, at("19:12"))).toBe("not-found");
    expect(
      await categorizeUnlogged(test.db, b.userId, {
        transactionId,
        categoryId: category.coffee ?? "",
      }),
    ).toBe("not-found");

    expect(await balance(a.userId)).toBe(342_000);
    const [row] = await test.db
      .select()
      .from(checkins)
      .where(and(eq(checkins.id, mine.id), isNull(checkins.deletedAt)));
    expect(row?.userId).toBe(a.userId);
    expect(await balance(b.userId)).toBe(350_000);
  });
});
