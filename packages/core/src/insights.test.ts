import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays } from "./cycle";
import { monthByCategory } from "./insights";
import type { SummaryTransaction } from "./summary";

// Last month: Sep 1 to Oct 1 (the money arrived on Oct 1). This month: from
// Oct 1; today is Oct 12, day 12.
const thisMonth = { cycleId: "oct", startedOn: "2026-10-01", today: "2026-10-12" };
const lastMonth = { cycleId: "sep", startedOn: "2026-09-01", endedOn: "2026-10-01" };

let at = 0;
const spend = (
  categoryId: string | null,
  amountMillimes: number,
  day: string,
  cycleId: string,
  extra: Partial<SummaryTransaction> = {},
): SummaryTransaction => ({
  type: "expense",
  walletId: "card",
  categoryId,
  amountMillimes,
  day,
  at: ++at,
  cycleId,
  ...extra,
});

const transactions: SummaryTransaction[] = [
  // Last month.
  { type: "income", walletId: "card", amountMillimes: 600_000, day: "2026-09-01", at: ++at },
  spend("coffee", 20_000, "2026-09-05", "sep"),
  spend("coffee", 18_000, "2026-09-12", "sep"),
  spend("coffee", 9_000, "2026-09-13", "sep"), // after day 12: not compared
  spend("transport", 15_000, "2026-09-03", "sep"),
  spend("coffee", 3_000, "2026-10-01", "sep"), // last month's last morning
  // This month.
  spend("coffee", 45_000, "2026-10-04", "oct"),
  spend("rent", 250_000, "2026-10-02", "oct", { planItemId: "rent-item" }),
  spend("groceries", 30_000, "2026-10-08", "oct"),
  spend(null, 8_000, "2026-10-10", "oct"), // unlogged, from a check-in
  spend("groceries", 7_000, "2026-10-13", "oct"), // tomorrow: not yet
  { type: "adjustment", walletId: "card", amountMillimes: -5_000, day: "2026-10-09", at: ++at },
  {
    type: "transfer",
    walletId: "card",
    toWalletId: "cash",
    amountMillimes: 40_000,
    day: "2026-10-05",
    at: ++at,
  },
  {
    type: "income",
    walletId: "card",
    amountMillimes: 600_000,
    day: "2026-10-01",
    at: ++at,
    cycleId: "oct",
  },
];

describe("monthByCategory", () => {
  it("compares this month with last month on the same day", () => {
    expect(monthByCategory({ thisMonth, lastMonth, transactions })).toEqual({
      day: 12,
      total: 333_000,
      lastMonthTotal: 53_000,
      lastMonthWhole: false,
      rows: [
        { categoryId: "rent", spent: 250_000, lastMonth: 0 },
        { categoryId: "coffee", spent: 45_000, lastMonth: 38_000 },
        { categoryId: "groceries", spent: 30_000, lastMonth: 0 },
        { categoryId: null, spent: 8_000, lastMonth: 0 },
        { categoryId: "transport", spent: 0, lastMonth: 15_000 },
      ],
    });
  });

  it("shows only this month in a first month", () => {
    expect(monthByCategory({ thisMonth, lastMonth: null, transactions })).toEqual({
      day: 12,
      total: 333_000,
      lastMonthTotal: null,
      lastMonthWhole: false,
      rows: [
        { categoryId: "rent", spent: 250_000, lastMonth: null },
        { categoryId: "coffee", spent: 45_000, lastMonth: null },
        { categoryId: "groceries", spent: 30_000, lastMonth: null },
        { categoryId: null, spent: 8_000, lastMonth: null },
      ],
    });
  });

  it("compares with all of last month when it was shorter", () => {
    // Day 35 of a long month (the money was late); last month had 31 days.
    const late = { ...thisMonth, today: "2026-11-04" };
    const result = monthByCategory({ thisMonth: late, lastMonth, transactions });
    expect(result).toMatchObject({ day: 35, lastMonthTotal: 65_000, lastMonthWhole: true });
    // On its last day, it's still the same point.
    const lastDay = { ...thisMonth, today: "2026-10-31" };
    expect(monthByCategory({ thisMonth: lastDay, lastMonth, transactions })).toMatchObject({
      day: 31,
      lastMonthTotal: 65_000,
      lastMonthWhole: false,
    });
  });

  it("orders same amounts with unlogged spending last", () => {
    const same = [
      spend(null, 5_000, "2026-10-02", "oct"),
      spend("b", 5_000, "2026-10-02", "oct"),
      spend("a", 5_000, "2026-10-02", "oct"),
    ];
    expect(
      monthByCategory({ thisMonth, lastMonth: null, transactions: same }).rows.map(
        (r) => r.categoryId,
      ),
    ).toEqual(["a", "b", null]);
  });

  it("refuses a today before the month started, and amounts that aren't millimes", () => {
    expect(() =>
      monthByCategory({
        thisMonth: { ...thisMonth, today: "2026-09-30" },
        lastMonth,
        transactions,
      }),
    ).toThrow(RangeError);
    expect(() =>
      monthByCategory({
        thisMonth,
        lastMonth,
        transactions: [spend("coffee", 0.5, "2026-10-02", "oct")],
      }),
    ).toThrow(RangeError);
  });

  // Property-based: the rows add up to everything spent.
  const category = fc.constantFrom("coffee", "rent", "groceries", null);
  const expense = fc.record({
    categoryId: category,
    amountMillimes: fc.integer({ min: 1, max: 100_000 }),
    offset: fc.integer({ min: 0, max: 70 }),
    type: fc.constantFrom<("expense" | "adjustment" | "income")[]>(
      "expense",
      "adjustment",
      "income",
    ),
  });

  it("the rows add up to what was spent in each month", () => {
    fc.assert(
      fc.property(
        fc.array(expense, { maxLength: 40 }),
        fc.integer({ min: 0, max: 40 }),
        (es, d) => {
          const txs: SummaryTransaction[] = es.map((e, i) => {
            const day = addDays("2026-09-01", e.offset);
            return {
              type: e.type,
              walletId: "card",
              categoryId: e.categoryId,
              amountMillimes: e.amountMillimes,
              day,
              at: i,
              cycleId: day < "2026-10-01" ? "sep" : "oct",
            };
          });
          const today = addDays("2026-10-01", d);
          const result = monthByCategory({
            thisMonth: { ...thisMonth, today },
            lastMonth,
            transactions: txs,
          });
          const spentIn = (cycleId: string, last: string) =>
            txs
              .filter((t) => t.type === "expense" && t.cycleId === cycleId && t.day <= last)
              .reduce((total, t) => total + t.amountMillimes, 0);
          expect(result.total).toBe(spentIn("oct", today));
          expect(result.rows.reduce((total, r) => total + r.spent, 0)).toBe(result.total);
          expect(result.rows.reduce((total, r) => total + (r.lastMonth ?? 0), 0)).toBe(
            result.lastMonthTotal,
          );
          const sameDay = addDays("2026-09-01", d);
          expect(result.lastMonthTotal).toBe(
            spentIn("sep", sameDay < "2026-10-01" ? sameDay : "2026-10-01"),
          );
          for (const row of result.rows)
            expect(row.spent + (row.lastMonth ?? 0)).toBeGreaterThan(0);
        },
      ),
    );
  });
});
