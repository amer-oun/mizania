import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { todayBudget, weekStartAllowance } from "./daily";
import { previewPlan } from "./plan";
import {
  canExpectOn,
  copyPlan,
  expectedDateRange,
  isLikelyNewMonth,
  lateDateRange,
  lateTransferDefault,
  newMonthInput,
  nextMonthExpectedOn,
  weekAfterIncome,
} from "./received";
import type { CycleSummaryInput, SummaryPlanItem } from "./summary";

describe("isLikelyNewMonth", () => {
  it("is true within 5 days of the expected date, before or after", () => {
    expect(isLikelyNewMonth("2026-10-26", "2026-10-31")).toBe(true);
    expect(isLikelyNewMonth("2026-10-25", "2026-10-31")).toBe(false);
    expect(isLikelyNewMonth("2026-11-05", "2026-10-31")).toBe(true);
    expect(isLikelyNewMonth("2026-11-06", "2026-10-31")).toBe(false);
  });
});

describe("nextMonthExpectedOn", () => {
  it("is the usual arrival day, at least 20 days away", () => {
    expect(nextMonthExpectedOn("2026-10-02", 1)).toBe("2026-11-01");
    // Arrived early, on the 28th: next expected the month after.
    expect(nextMonthExpectedOn("2026-10-28", 1)).toBe("2026-12-01");
    expect(nextMonthExpectedOn("2026-10-11", 31)).toBe("2026-10-31");
    expect(nextMonthExpectedOn("2026-10-12", 31)).toBe("2026-11-30");
  });
});

describe("expected dates", () => {
  it("suggests two days later when the money hasn't arrived", () => {
    expect(lateTransferDefault("2026-10-31")).toBe("2026-11-02");
  });

  it("accepts a date from today, after the month's start, within 62 days", () => {
    expect(canExpectOn("2026-10-20", "2026-10-20", "2026-10-01")).toBe(true);
    expect(canExpectOn("2026-10-19", "2026-10-20", "2026-10-01")).toBe(false);
    expect(canExpectOn("2026-12-21", "2026-10-20", "2026-10-01")).toBe(true);
    expect(canExpectOn("2026-12-22", "2026-10-20", "2026-10-01")).toBe(false);
    // A month that started today: from tomorrow.
    expect(canExpectOn("2026-10-20", "2026-10-20", "2026-10-20")).toBe(false);
    expect(canExpectOn("2026-10-21", "2026-10-20", "2026-10-20")).toBe(true);
  });

  it("gives the date picker's range, and tomorrow on for 'Not yet'", () => {
    expect(expectedDateRange("2026-10-20", "2026-10-01")).toEqual({
      min: "2026-10-20",
      max: "2026-12-21",
    });
    expect(expectedDateRange("2026-10-20", "2026-10-20")).toEqual({
      min: "2026-10-21",
      max: "2026-12-21",
    });
    expect(lateDateRange("2026-10-31")).toEqual({ min: "2026-11-01", max: "2027-01-01" });
  });
});

const lastPlan: SummaryPlanItem[] = [
  { id: "rent", kind: "fixed", categoryId: "rent", amountMillimes: 250_000, paid: true },
  { id: "food", kind: "envelope", categoryId: "groceries", amountMillimes: 80_000, paid: false },
  { id: "save", kind: "savings", categoryId: null, amountMillimes: 30_000, paid: false },
];

describe("copyPlan", () => {
  it("copies every item at its planned amount, with new IDs", () => {
    let n = 0;
    expect(copyPlan(lastPlan, () => `new-${String(++n)}`)).toEqual([
      { id: "new-1", kind: "fixed", categoryId: "rent", amountMillimes: 250_000 },
      { id: "new-2", kind: "envelope", categoryId: "groceries", amountMillimes: 80_000 },
      { id: "new-3", kind: "savings", categoryId: null, amountMillimes: 30_000 },
    ]);
  });
});

describe("newMonthInput", () => {
  // Last month: Oct 1 to Oct 31; the money arrives on Oct 31.
  const today = "2026-10-31";
  const lastMonth: CycleSummaryInput = {
    cycleId: "last",
    today,
    startedOn: "2026-10-01",
    nextTransferOn: today,
    wallets: [{ id: "card", archived: false }],
    planItems: lastPlan,
    transactions: [
      {
        type: "adjustment",
        walletId: "card",
        amountMillimes: 500_000,
        day: "2026-10-01",
        at: 1,
        cycleId: "last",
      },
      // Coffee this morning, before the money arrived: last month's.
      {
        type: "expense",
        walletId: "card",
        amountMillimes: 2_000,
        categoryId: "coffee",
        day: today,
        at: 2,
        cycleId: "last",
      },
    ],
  };
  const month = {
    cycleId: "new",
    nextTransferOn: "2026-11-30",
    income: { walletId: "card", amountMillimes: 600_000, at: 3 },
  };

  it("starts today with the money received and without last month's spending", () => {
    const input = newMonthInput(lastMonth, month);
    expect(input).toMatchObject({
      cycleId: "new",
      startedOn: today,
      nextTransferOn: "2026-11-30",
      planItems: [],
    });
    let n = 0;
    const { after } = previewPlan({
      summary: input,
      weeklyMode: false,
      draft: copyPlan(lastPlan, () => `item-${String(++n)}`),
      now: 4,
    });
    // 498 left + 600 received − 360 set aside = 738 over 30 days.
    expect(after.reserved).toBe(360_000);
    expect(after.poolNow).toBe(738_000);
    expect(after.today).toMatchObject({ allowance: 24_600, spent: 0 });
  });

  it("refuses an amount that isn't whole millimes", () => {
    expect(() =>
      newMonthInput(lastMonth, { ...month, income: { ...month.income, amountMillimes: 0.5 } }),
    ).toThrow(RangeError);
  });
});

// Week 2 of a month from Oct 1 to Oct 31 (Oct 8–14).
const cycle = { startedOn: "2026-10-01", nextTransferOn: "2026-10-31", today: "2026-10-10" };

describe("weekAfterIncome", () => {
  const after = { ...cycle, poolNow: 230_000, spentToday: 0, spentThisWeekBeforeToday: 0 };
  it("keeps a week above 0, and rebuilds a week stored at 0", () => {
    expect(weekAfterIncome(50_000, after)).toBe(50_000);
    // 230 × 7 / 23 = 70.
    expect(weekAfterIncome(0, after)).toBe(70_000);
    expect(() => weekAfterIncome(-1.5, after)).toThrow(RangeError);
  });
});

const money = fc.integer({ min: 0, max: 500_000 });
const budget = fc.record({
  poolNow: fc.integer({ min: -300_000, max: 500_000 }),
  spentToday: money,
  spentThisWeekBeforeToday: money,
  income: fc.integer({ min: 1, max: 500_000 }),
});

describe("weekAfterIncome properties", () => {
  it("a week above 0 stays as it is, and an overspent one stays overspent", () => {
    fc.assert(
      fc.property(budget, fc.integer({ min: 1, max: 300_000 }), (b, stored) => {
        const after = { ...cycle, ...b, poolNow: b.poolNow + b.income };
        const week = weekAfterIncome(stored, after);
        expect(week).toBe(stored);
        const budgetAfter = todayBudget({ ...after, weeklyMode: true, weekAllowance: week });
        expect(budgetAfter.week?.allowance).toBe(stored);
        if (b.spentThisWeekBeforeToday + b.spentToday > stored) {
          expect(budgetAfter.week?.left).toBeLessThan(0);
        }
      }),
    );
  });

  it("a week stored at 0 is rebuilt with the money, as if it weren't stored", () => {
    fc.assert(
      fc.property(budget, (b) => {
        const after = { ...cycle, ...b, poolNow: b.poolNow + b.income };
        const week = weekAfterIncome(0, after);
        expect(week).toBe(weekStartAllowance(after).allowance);
        expect(todayBudget({ ...after, weeklyMode: true, weekAllowance: week })).toEqual(
          todayBudget({ ...after, weeklyMode: true }),
        );
      }),
    );
  });
});
