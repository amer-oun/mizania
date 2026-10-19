// "This month by category" (PLAN.md decision 12): what was spent in each
// category this month, compared with last month at the same point (day 12
// with day 12). All amounts are integer millimes; days are calendar days in
// Africa/Tunis.

import { addDays, assertIsoDate, daysBetween, type IsoDate } from "./cycle";
import { assertMillimes } from "./money";
import { isThisMonths, type SummaryTransaction } from "./summary";

export interface MonthByCategoryInput {
  /** This month: its ID, its first day, and today. */
  thisMonth: { cycleId: string; startedOn: IsoDate; today: IsoDate };
  /**
   * The month before, if there is one. It ended on `endedOn`, the day this
   * month started (the money arrived that day).
   */
  lastMonth: { cycleId: string; startedOn: IsoDate; endedOn: IsoDate } | null;
  /** The user's transactions that aren't deleted, from any month. */
  transactions: readonly SummaryTransaction[];
}

export interface CategorySpending {
  /** Null: unlogged spending found by a check-in, no category yet. */
  categoryId: string | null;
  /** Spent this month so far. */
  spent: number;
  /** Spent last month at the same point; null in a first month. */
  lastMonth: number | null;
}

export interface MonthByCategory {
  /** Today is day N of this month (day 1 is the day the money arrived). */
  day: number;
  /** Everything spent this month so far. */
  total: number;
  /** Everything spent last month at the same point; null in a first month. */
  lastMonthTotal: number | null;
  /** Last month had fewer days than this one so far: compared with all of it. */
  lastMonthWhole: boolean;
  /** One row per category spent in this month or last month's same days, biggest first. */
  rows: CategorySpending[];
}

/** Each category's spending (expenses only) in a month up to `today`. */
function spentByCategory(
  month: { cycleId: string; startedOn: IsoDate; today: IsoDate },
  transactions: readonly SummaryTransaction[],
): Map<string | null, number> {
  const spent = new Map<string | null, number>();
  for (const t of transactions) {
    if (t.type !== "expense" || !isThisMonths(month, t)) continue;
    const key = t.categoryId ?? null;
    spent.set(key, (spent.get(key) ?? 0) + t.amountMillimes);
  }
  return spent;
}

const sum = (amounts: Iterable<number>) => {
  let total = 0;
  for (const amount of amounts) total += amount;
  assertMillimes(total);
  return total;
};

/**
 * Everything spent this month, by category: expenses inside the plan or
 * not, fixed-cost payments, and unlogged spending found by a check-in.
 * Transfers, income and corrections aren't spending. Later months are
 * compared with last month up to the same day number, or with all of it
 * when it was shorter.
 */
export function monthByCategory(input: MonthByCategoryInput): MonthByCategory {
  const { thisMonth, lastMonth } = input;
  assertIsoDate(thisMonth.today);
  const day = daysBetween(thisMonth.startedOn, thisMonth.today) + 1;
  if (day < 1) throw new RangeError(`Today (${thisMonth.today}) is before the month started.`);
  for (const t of input.transactions) assertMillimes(t.amountMillimes);

  const now = spentByCategory(thisMonth, input.transactions);
  let before: Map<string | null, number> | null = null;
  let lastMonthWhole = false;
  if (lastMonth) {
    const sameDay = addDays(lastMonth.startedOn, day - 1);
    lastMonthWhole = daysBetween(lastMonth.endedOn, sameDay) > 0;
    before = spentByCategory(
      {
        cycleId: lastMonth.cycleId,
        startedOn: lastMonth.startedOn,
        today: lastMonthWhole ? lastMonth.endedOn : sameDay,
      },
      input.transactions,
    );
  }

  const keys = new Set([...now.keys(), ...(before?.keys() ?? [])]);
  const rows = [...keys]
    .map((categoryId) => ({
      categoryId,
      spent: now.get(categoryId) ?? 0,
      lastMonth: before ? (before.get(categoryId) ?? 0) : null,
    }))
    .sort(
      (a, b) =>
        b.spent - a.spent ||
        (b.lastMonth ?? 0) - (a.lastMonth ?? 0) ||
        // Same amounts: unlogged spending last, then by ID (a stable order).
        Number(a.categoryId === null) - Number(b.categoryId === null) ||
        String(a.categoryId).localeCompare(String(b.categoryId)),
    );

  return {
    day,
    total: sum(now.values()),
    lastMonthTotal: before ? sum(before.values()) : null,
    lastMonthWhole,
    rows,
  };
}
