// Money received (ADR 006 §5–6): the monthly transfer that starts a new
// month, extra money, and a transfer that's late. All amounts are integer
// millimes; all dates are calendar days in Africa/Tunis.

import { addDays, daysBetween, type IsoDate, nextTransferDate } from "./cycle";
import { type TodayBudgetInput, weekStartAllowance } from "./daily";
import { assertMillimes } from "./money";
import type { PlanDraftItem } from "./plan";
import type { CycleSummaryInput, SummaryPlanItem } from "./summary";

/** Where money comes from (decision 10). */
export const incomeSources = ["parents", "bourse", "job", "other"] as const;
export type IncomeSource = (typeof incomeSources)[number];

/** "New month" is preselected this many days around the expected date. */
const NEW_MONTH_WINDOW_DAYS = 5;
/** A new month lasts at least this long: money that comes early skips a month. */
const MIN_MONTH_DAYS = 20;
/** The furthest an expected date can be set. */
const MAX_EXPECTED_DAYS = 62;
/** "Not yet" suggests the money two days later. */
const LATE_DEFAULT_DAYS = 2;

/** True within 5 days of the expected date, before or after it: "new month" by default. */
export function isLikelyNewMonth(today: IsoDate, expectedOn: IsoDate): boolean {
  return Math.abs(daysBetween(today, expectedOn)) <= NEW_MONTH_WINDOW_DAYS;
}

/**
 * The next expected date of a month starting today: the usual arrival day,
 * at least 20 days away (money that came early, on the 28th for an arrival
 * on the 1st, is next expected the month after).
 */
export function nextMonthExpectedOn(today: IsoDate, arrivalDay: number): IsoDate {
  const next = nextTransferDate(today, arrivalDay);
  return daysBetween(today, next) >= MIN_MONTH_DAYS ? next : nextTransferDate(next, arrivalDay);
}

/** The new date "Not yet" suggests: two days from today. */
export function lateTransferDefault(today: IsoDate): IsoDate {
  return addDays(today, LATE_DEFAULT_DAYS);
}

/**
 * Whether the money can be expected on `on` in a month that started on
 * `startedOn`: from today (the day after the start at the earliest), and at
 * most 62 days from today.
 */
export function canExpectOn(on: IsoDate, today: IsoDate, startedOn: IsoDate): boolean {
  const { min, max } = expectedDateRange(today, startedOn);
  return daysBetween(min, on) >= 0 && daysBetween(on, max) >= 0;
}

/** The dates canExpectOn accepts, for a date picker. */
export function expectedDateRange(
  today: IsoDate,
  startedOn: IsoDate,
): { min: IsoDate; max: IsoDate } {
  const dayAfterStart = addDays(startedOn, 1);
  return {
    min: daysBetween(today, dayAfterStart) > 0 ? dayAfterStart : today,
    max: addDays(today, MAX_EXPECTED_DAYS),
  };
}

/** "Not yet": from tomorrow (today would ask again at once). */
export function lateDateRange(today: IsoDate): { min: IsoDate; max: IsoDate } {
  return { min: addDays(today, 1), max: addDays(today, MAX_EXPECTED_DAYS) };
}

/**
 * A new month's plan, copied from the last one: the same fixed costs,
 * envelopes and savings at their planned amounts, nothing paid or spent yet.
 */
export function copyPlan(items: readonly SummaryPlanItem[], newId: () => string): PlanDraftItem[] {
  return items.map((item) => ({
    id: newId(),
    kind: item.kind,
    categoryId: item.categoryId,
    amountMillimes: item.amountMillimes,
  }));
}

/**
 * The numbers of a new month before it's saved: it starts today with the
 * money received, its own ID, no plan yet (the draft goes to previewPlan)
 * and none of the last month's spending.
 */
export function newMonthInput(
  input: CycleSummaryInput,
  month: {
    cycleId: string;
    nextTransferOn: IsoDate;
    income: { walletId: string; amountMillimes: number; at: number };
  },
): CycleSummaryInput {
  assertMillimes(month.income.amountMillimes);
  return {
    ...input,
    cycleId: month.cycleId,
    startedOn: input.today,
    nextTransferOn: month.nextTransferOn,
    planItems: [],
    transactions: [
      ...input.transactions,
      {
        type: "income",
        walletId: month.income.walletId,
        amountMillimes: month.income.amountMillimes,
        day: input.today,
        at: month.income.at,
        cycleId: month.cycleId,
      },
    ],
  };
}

/**
 * Weekly mode: this week's stored amount after extra money. Extra money
 * shows from next week, so a week above 0 stays as it is. A week stored at
 * 0 (the plan needed more than the money) is rebuilt with the money, so the
 * student gets money this week (the same exception as a plan change).
 */
export function weekAfterIncome(
  stored: number,
  after: Omit<TodayBudgetInput, "weeklyMode" | "weekAllowance">,
): number {
  assertMillimes(stored);
  return stored === 0 ? weekStartAllowance(after).allowance : stored;
}
