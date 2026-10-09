import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, type IsoDate } from "./cycle";
import { todayBudget } from "./daily";
import {
  cycleSummary,
  type CycleSummaryInput,
  type SummaryPlanItem,
  type SummaryTransaction,
} from "./summary";

// Cycle: money arrived Oct 1, next transfer Oct 31. Today is Oct 10, in the
// second week (Oct 8–14).
const cycle = { startedOn: "2026-10-01", nextTransferOn: "2026-10-31", today: "2026-10-10" };
const wallets = [
  { id: "cash", archived: false },
  { id: "card", archived: false },
  { id: "d17", archived: false },
  { id: "old", archived: true },
];

let clock = 0;
/** A transaction on `day`; later calls happen later in time. */
function tx(day: IsoDate, t: Omit<SummaryTransaction, "day" | "at">): SummaryTransaction {
  clock += 1;
  return { ...t, day, at: Date.parse(`${day}T12:00:00Z`) + clock };
}
const expense = (day: IsoDate, walletId: string, amountMillimes: number, extra = {}) =>
  tx(day, { type: "expense", walletId, amountMillimes, ...extra });

const plan: SummaryPlanItem[] = [
  { id: "rent", kind: "fixed", categoryId: "rent", amountMillimes: 250_000, paid: true },
  { id: "steg", kind: "fixed", categoryId: "electricity", amountMillimes: 30_000, paid: false },
  { id: "net", kind: "fixed", categoryId: "internet", amountMillimes: 35_000, paid: true },
  { id: "food", kind: "envelope", categoryId: "groceries", amountMillimes: 100_000, paid: false },
  { id: "gift", kind: "envelope", categoryId: null, amountMillimes: 15_000, paid: false },
  { id: "laptop", kind: "savings", categoryId: null, amountMillimes: 40_000, paid: false },
];

const history: SummaryTransaction[] = [
  // Last cycle: counts in the balance, not in this cycle's spending.
  tx("2026-09-01", { type: "adjustment", walletId: "old", amountMillimes: 5_000 }),
  expense("2026-09-30", "cash", 7_000, { categoryId: "coffee" }),
  tx("2026-10-01", { type: "adjustment", walletId: "card", amountMillimes: 500_000 }),
  tx("2026-10-01", { type: "adjustment", walletId: "cash", amountMillimes: 20_000 }),
  tx("2026-10-02", {
    type: "transfer",
    walletId: "card",
    toWalletId: "cash",
    amountMillimes: 50_000,
  }),
  expense("2026-10-02", "card", 250_000, { categoryId: "rent", planItemId: "rent" }),
  expense("2026-10-03", "cash", 60_000, { categoryId: "groceries" }),
  tx("2026-10-05", { type: "income", walletId: "d17", amountMillimes: 100_000 }),
  expense("2026-10-09", "cash", 2_500, { categoryId: "coffee" }),
  // 40.000 left in the envelope: 10.000 of it is daily money.
  expense("2026-10-09", "cash", 50_000, { categoryId: "groceries" }),
  // Internet cost 5.000 more than planned.
  expense("2026-10-10", "card", 40_000, { categoryId: "internet", planItemId: "net" }),
  expense("2026-10-10", "cash", 1_500, { categoryId: "coffee" }),
  tx("2026-10-10", { type: "adjustment", walletId: "cash", amountMillimes: -3_000 }),
];

const input: CycleSummaryInput = { ...cycle, wallets, planItems: plan, transactions: history };

describe("cycleSummary", () => {
  it("sums the active wallets, what's set aside, and the daily spending", () => {
    const summary = cycleSummary(input);
    // card 160.000 + cash −54.000 + D17 100.000; the archived wallet doesn't count.
    expect(summary.available).toBe(206_000);
    expect(summary.reserved).toEqual({
      fixed: 30_000, // STEG, unpaid
      envelopes: 15_000, // groceries used up + the gift envelope
      savings: 40_000,
      total: 85_000,
    });
    expect(summary.poolNow).toBe(121_000);
    // Coffee 1.500 + internet over plan 5.000 + money gone 3.000.
    expect(summary.spentToday).toBe(9_500);
    // Oct 8–9: coffee 2.500 + groceries over the envelope 10.000.
    expect(summary.spentThisWeekBeforeToday).toBe(12_500);
    expect(summary.spendingByDay).toHaveLength(10);
    expect(summary.spendingByDay.filter((d) => d.amount > 0)).toEqual([
      { day: "2026-10-09", amount: 12_500 },
      { day: "2026-10-10", amount: 9_500 },
    ]);
  });

  it("starts from the onboarding: balances in, unpaid fixed costs set aside", () => {
    const summary = cycleSummary({
      today: "2026-10-08",
      startedOn: "2026-10-08",
      nextTransferOn: "2026-11-01",
      wallets: [{ id: "cash", archived: false }],
      planItems: [
        { id: "rent", kind: "fixed", categoryId: "rent", amountMillimes: 250_000, paid: false },
      ],
      transactions: [
        tx("2026-10-08", { type: "adjustment", walletId: "cash", amountMillimes: 400_000 }),
      ],
    });
    expect(summary).toEqual({
      available: 400_000,
      reserved: { fixed: 250_000, envelopes: 0, savings: 0, total: 250_000 },
      poolNow: 150_000,
      spentToday: 0,
      spentThisWeekBeforeToday: 0,
      spendingByDay: [{ day: "2026-10-08", amount: 0 }],
      dailyParts: new Map(),
      fixedCosts: [{ id: "rent", planned: 250_000, paidSoFar: 0, left: 250_000, paid: false }],
      envelopes: [],
    });
  });

  it("gives each fixed cost and envelope what's paid or spent, and what's left", () => {
    const summary = cycleSummary(input);
    expect(summary.fixedCosts).toEqual([
      { id: "rent", planned: 250_000, paidSoFar: 250_000, left: 0, paid: true },
      { id: "steg", planned: 30_000, paidSoFar: 0, left: 30_000, paid: false },
      // 40 paid for 35 planned; marked paid.
      { id: "net", planned: 35_000, paidSoFar: 40_000, left: 0, paid: true },
    ]);
    expect(summary.envelopes).toEqual([
      { categoryId: "groceries", planned: 100_000, spent: 110_000, left: 0 },
      { categoryId: null, planned: 15_000, spent: 0, left: 15_000 },
    ]);
  });

  it("keeps a partly paid fixed cost's rest set aside", () => {
    const summary = cycleSummary({
      ...input,
      planItems: [
        { id: "rent", kind: "fixed", categoryId: "rent", amountMillimes: 250_000, paid: false },
      ],
      transactions: [
        ...history.filter((t) => t.planItemId !== "rent"),
        expense("2026-10-05", "card", 125_000, { categoryId: "rent", planItemId: "rent" }),
      ],
    });
    expect(summary.fixedCosts).toEqual([
      { id: "rent", planned: 250_000, paidSoFar: 125_000, left: 125_000, paid: false },
    ]);
    expect(summary.reserved.fixed).toBe(125_000);
  });

  it("gives each transaction with an ID its daily part", () => {
    const summary = cycleSummary({
      ...input,
      transactions: [
        ...history,
        { ...expense("2026-10-10", "cash", 4_000, { categoryId: "coffee" }), id: "coffee" },
        { ...expense("2026-10-10", "cash", 1_000, { categoryId: "groceries" }), id: "food" },
        { ...expense("2026-09-30", "cash", 1_000, { categoryId: "coffee" }), id: "before" },
        {
          ...tx("2026-10-10", {
            type: "transfer",
            walletId: "cash",
            toWalletId: "card",
            amountMillimes: 1,
          }),
          id: "move",
        },
      ],
    });
    // The groceries envelope is already used up, so all of it is daily money.
    expect(Object.fromEntries(summary.dailyParts)).toEqual({ coffee: 4_000, food: 1_000, move: 0 });
  });

  it("adds up two envelopes for the same category", () => {
    const summary = cycleSummary({
      ...input,
      planItems: [
        { id: "a", kind: "envelope", categoryId: "groceries", amountMillimes: 30_000, paid: false },
        { id: "b", kind: "envelope", categoryId: "groceries", amountMillimes: 20_000, paid: false },
      ],
      transactions: [expense("2026-10-10", "cash", 45_000, { categoryId: "groceries" })],
    });
    expect(summary.reserved.envelopes).toBe(5_000);
    expect(summary.spentToday).toBe(0);
  });

  it("counts a payment for an unknown plan item, or without a category, as daily money", () => {
    const summary = cycleSummary({
      ...input,
      planItems: [],
      transactions: [
        expense("2026-10-10", "cash", 1_000, { planItemId: "gone" }),
        expense("2026-10-10", "cash", 2_000),
      ],
    });
    expect(summary.spentToday).toBe(3_000);
  });

  it("refuses a plan amount of 0 and a today before the cycle", () => {
    expect(() =>
      cycleSummary({
        ...input,
        planItems: [{ id: "x", kind: "savings", categoryId: null, amountMillimes: 0, paid: false }],
      }),
    ).toThrow(RangeError);
    expect(() => cycleSummary({ ...input, today: "2026-09-30" })).toThrow(RangeError);
    expect(() => cycleSummary({ ...input, today: "2026-02-30" })).toThrow(RangeError);
  });
});

// Random plans and histories within the cycle.
const days = Array.from({ length: 10 }, (_, i) => addDays(cycle.startedOn, i));
const categories = ["coffee", "groceries", "studies", "rent", "electricity"];
const amount = fc.integer({ min: 1, max: 200_000 });

const randomPlan = fc.record({
  rent: amount,
  steg: amount,
  groceries: amount,
  studies: amount,
  savings: amount,
});
interface RandomPlan {
  rent: number;
  steg: number;
  groceries: number;
  studies: number;
  savings: number;
}
const planItemsOf = (p: RandomPlan) =>
  [
    { id: "rent", kind: "fixed", categoryId: "rent", amountMillimes: p.rent, paid: false },
    { id: "steg", kind: "fixed", categoryId: "electricity", amountMillimes: p.steg, paid: false },
    {
      id: "g",
      kind: "envelope",
      categoryId: "groceries",
      amountMillimes: p.groceries,
      paid: false,
    },
    { id: "s", kind: "envelope", categoryId: "studies", amountMillimes: p.studies, paid: false },
    { id: "save", kind: "savings", categoryId: null, amountMillimes: p.savings, paid: false },
  ] satisfies SummaryPlanItem[];

const wallet = fc.constantFrom("cash", "card", "d17");
const randomTx = fc.oneof(
  fc.record({
    day: fc.constantFrom(...days),
    type: fc.constant("expense" as const),
    walletId: wallet,
    amountMillimes: amount,
    categoryId: fc.constantFrom(...categories),
    planItemId: fc.constantFrom(null, "rent", "steg"),
  }),
  fc.record({
    day: fc.constantFrom(...days),
    type: fc.constant("income" as const),
    walletId: wallet,
    amountMillimes: amount,
  }),
  fc.record({
    day: fc.constantFrom(...days),
    type: fc.constant("adjustment" as const),
    walletId: wallet,
    amountMillimes: fc.oneof(
      amount,
      amount.map((a) => -a),
    ),
  }),
  fc.record({
    day: fc.constantFrom(...days),
    type: fc.constant("transfer" as const),
    walletId: fc.constant("card"),
    toWalletId: fc.constant("cash"),
    amountMillimes: amount,
  }),
);
const randomHistory = fc
  .array(randomTx, { maxLength: 30 })
  .map((list) => list.map((t, i) => ({ ...t, at: Date.parse(`${t.day}T08:00:00Z`) + i })));

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const summarize = (planned: SummaryPlanItem[], transactions: SummaryTransaction[]) =>
  cycleSummary({ ...cycle, wallets, planItems: planned, transactions });

// The table in the PR plan: 20 days left, 200 DT of daily money, STEG
// planned at 30 DT. Normal mode.
describe("paying a fixed cost: same, higher or lower than planned", () => {
  const start = "2026-10-01";
  const today = "2026-10-11"; // Oct 11 → 31: 20 days left
  const steg: SummaryPlanItem = {
    id: "steg",
    kind: "fixed",
    categoryId: "electricity",
    amountMillimes: 30_000,
    paid: false,
  };
  const funds = tx(start, { type: "adjustment", walletId: "cash", amountMillimes: 230_000 });
  const pay = (amountMillimes: number) =>
    expense(today, "cash", amountMillimes, { categoryId: "electricity", planItemId: "steg" });
  const budgetAfter = (paid: boolean, payments: SummaryTransaction[]) => {
    const s = cycleSummary({
      today,
      startedOn: start,
      nextTransferOn: "2026-10-31",
      wallets: [{ id: "cash", archived: false }],
      planItems: [{ ...steg, paid }],
      transactions: [funds, ...payments],
    });
    return todayBudget({
      today,
      startedOn: start,
      nextTransferOn: "2026-10-31",
      poolNow: s.poolNow,
      spentToday: s.spentToday,
      spentThisWeekBeforeToday: s.spentThisWeekBeforeToday,
      weeklyMode: false,
    });
  };

  it("before paying: 200 DT over 20 days is 10 DT a day", () => {
    expect(budgetAfter(false, [])).toMatchObject({ allowance: 10_000, left: 10_000 });
  });

  it("same: nothing moves", () => {
    expect(budgetAfter(true, [pay(30_000)])).toMatchObject({ allowance: 10_000, left: 10_000 });
  });

  it("higher: today's amount stays, what's left drops by the difference", () => {
    expect(budgetAfter(true, [pay(36_000)])).toMatchObject({
      allowance: 10_000,
      left: 4_000,
      status: "on_track",
    });
  });

  it("lower and marked paid: the rest goes back into the daily money at once", () => {
    // 205 DT over 20 days.
    expect(budgetAfter(true, [pay(25_000)])).toMatchObject({ allowance: 10_250, left: 10_250 });
  });

  it("lower but not marked paid: the rest stays set aside", () => {
    expect(budgetAfter(false, [pay(25_000)])).toMatchObject({ allowance: 10_000, left: 10_000 });
  });
});

describe("cycleSummary properties", () => {
  it("classifies every millime of spending exactly once", () => {
    fc.assert(
      fc.property(randomPlan, randomHistory, (p, h) => {
        const items = planItemsOf(p);
        const s = summarize(items, h);
        const spent = sum(
          h.map((t) =>
            t.type === "expense"
              ? t.amountMillimes
              : t.type === "adjustment" && t.amountMillimes < 0
                ? -t.amountMillimes
                : 0,
          ),
        );
        const fixedUsed = p.rent + p.steg - s.reserved.fixed;
        const envelopesUsed = p.groceries + p.studies - s.reserved.envelopes;
        expect(sum(s.spendingByDay.map((d) => d.amount)) + fixedUsed + envelopesUsed).toBe(spent);
        expect(s.reserved.savings).toBe(p.savings);
        expect(s.poolNow).toBe(s.available - s.reserved.total);
        expect(sum(s.fixedCosts.map((c) => c.left))).toBe(s.reserved.fixed);
        expect(sum(s.envelopes.map((e) => e.left))).toBe(s.reserved.envelopes);
        for (const cost of s.fixedCosts) {
          const payments = h.filter((t) => t.type === "expense" && t.planItemId === cost.id);
          expect(cost.paidSoFar).toBe(sum(payments.map((t) => t.amountMillimes)));
        }
      }),
    );
  });

  it("gives daily parts that add up to each day's spending", () => {
    fc.assert(
      fc.property(randomPlan, randomHistory, (p, h) => {
        const s = summarize(
          planItemsOf(p),
          h.map((t, i) => ({ ...t, id: String(i) })),
        );
        for (const { day, amount } of s.spendingByDay) {
          const parts = h.flatMap((t, i) =>
            t.day === day ? [s.dailyParts.get(String(i)) ?? 0] : [],
          );
          expect(sum(parts)).toBe(amount);
        }
      }),
    );
  });

  it("isn't changed by transfers between wallets", () => {
    fc.assert(
      fc.property(randomPlan, randomHistory, randomHistory, (p, h, extra) => {
        const transfers = extra.filter((t) => t.type === "transfer");
        expect(summarize(planItemsOf(p), [...h, ...transfers])).toEqual(
          summarize(planItemsOf(p), h),
        );
      }),
    );
  });

  it("paying a fixed cost at its planned amount leaves the daily money unchanged", () => {
    fc.assert(
      fc.property(randomPlan, randomHistory, (p, h) => {
        const before = summarize(planItemsOf(p), h);
        const paid = planItemsOf(p).map((i) => (i.id === "steg" ? { ...i, paid: true } : i));
        // Only when nothing was paid towards it yet.
        fc.pre(h.every((t) => t.type !== "expense" || t.planItemId !== "steg"));
        const after = summarize(paid, [
          ...h,
          {
            day: cycle.today,
            at: Date.parse("2026-10-10T23:00:00Z"),
            type: "expense",
            walletId: "card",
            amountMillimes: p.steg,
            categoryId: "electricity",
            planItemId: "steg",
          },
        ]);
        expect(after.poolNow).toBe(before.poolNow);
        expect(after.spentToday).toBe(before.spentToday);
        expect(after.available).toBe(before.available - p.steg);
      }),
    );
  });

  it("never lowers today's amount during the day, whatever is logged", () => {
    const later = fc.oneof(
      fc.record({
        type: fc.constant("expense" as const),
        walletId: wallet,
        amountMillimes: amount,
        categoryId: fc.constantFrom(...categories),
        planItemId: fc.constantFrom(null, "rent", "steg"),
      }),
      fc.record({ type: fc.constant("income" as const), walletId: wallet, amountMillimes: amount }),
      fc.record({
        type: fc.constant("adjustment" as const),
        walletId: wallet,
        amountMillimes: fc.oneof(
          amount,
          amount.map((a) => -a),
        ),
      }),
    );
    fc.assert(
      fc.property(randomPlan, randomHistory, later, fc.boolean(), (p, h, t, weeklyMode) => {
        const items = planItemsOf(p);
        const budget = (s: ReturnType<typeof summarize>, weekAllowance?: number) =>
          todayBudget({ ...cycle, ...s, weeklyMode, weekAllowance });
        const before = summarize(items, h);
        const after = summarize(items, [
          ...h,
          { ...t, day: cycle.today, at: Date.parse("2026-10-10T23:59:00Z") },
        ]);
        expect(budget(after).allowance).toBeGreaterThanOrEqual(budget(before).allowance);
        // Same with this week's amount stored this morning.
        const stored = budget(before).week?.allowance;
        expect(budget(after, stored).allowance).toBeGreaterThanOrEqual(
          budget(before, stored).allowance,
        );
      }),
    );
  });
});
